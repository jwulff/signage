/**
 * Stream-Triggered Analysis Lambda
 *
 * Triggered by DynamoDB Streams when new diabetes data arrives.
 * Filters for relevant record types, applies freshness and debounce checks,
 * then invokes the Bedrock Agent to generate insights for the display.
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { Resource } from "sst";
import { createDocClient, storeInsight, getCurrentInsight } from "@diabetes/core";
import type { DynamoDBStreamHandler } from "aws-lambda";

const bedrockClient = new BedrockAgentRuntimeClient({});
const docClient = createDocClient();

const DEFAULT_USER_ID = "john";

// LED display fits 30 characters (2 lines x 15 chars)
const MAX_INSIGHT_LENGTH = 30;
const MAX_SHORTEN_ATTEMPTS = 2;

// Only these record types trigger analysis (UPPERCASE - matches keys.ts)
const TRIGGER_TYPES = new Set(["CGM", "BOLUS", "BASAL", "CARBS"]);

// Only analyze fresh data (skip historical backfills from Glooko)
const FRESHNESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// Debounce: skip if last analysis was < 60 seconds ago
const DEBOUNCE_MS = 60_000;

/**
 * Stream-triggered analysis handler
 */
export const handler: DynamoDBStreamHandler = async (event) => {
  const now = Date.now();

  // Filter for: INSERT + trigger type + fresh data only
  const relevantRecords = event.Records.filter((record) => {
    if (record.eventName !== "INSERT") return false;

    const pk = record.dynamodb?.NewImage?.pk?.S;
    if (!pk) return false;

    // PK format: USR#{userId}#{TYPE}#{date}
    const recordType = pk.split("#")[2];
    if (!TRIGGER_TYPES.has(recordType)) return false;

    // Skip historical backfills - only analyze fresh data
    const timestamp = record.dynamodb?.NewImage?.timestamp?.N;
    if (timestamp && now - Number(timestamp) > FRESHNESS_THRESHOLD_MS) {
      return false;
    }

    return true;
  });

  if (relevantRecords.length === 0) {
    console.log("No fresh relevant records, skipping");
    return;
  }

  console.log(`Stream triggered with ${relevantRecords.length} relevant records`);

  // Debounce: check last analysis time
  const currentInsight = await getCurrentInsight(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID
  );

  if (currentInsight && now - currentInsight.generatedAt < DEBOUNCE_MS) {
    console.log("Debounce: analysis ran recently, skipping");
    return;
  }

  // Run comprehensive analysis for the sign's two-line insight
  const sessionId = `stream-${now}`;

  try {
    // Prompt the agent to generate a concise insight
    const initialPrompt = `Generate a short insight for my LED display (max 30 characters).

TONE: You're an encouraging diabetes coach. Be warm and supportive when things are good, direct and helpful (never judgmental) when attention is needed.

DATA SOURCES:
- Dexcom: Real-time CGM readings (most current)
- Glooko: Insulin, carbs, and historical data (may be hours old)
Consider how fresh each data source is when forming your insight.

GOOD EXAMPLES (natural language, under 30 chars):

Celebrating wins:
- "In range all day!"
- "Steady overnight, nice!"
- "Great morning so far"
- "Nailed it today!"
- "Best day this week!"

Gentle nudges:
- "Running high, check it"
- "Trending up, watch it"
- "Bit high, no worries"
- "Creeping up slowly"

Action needed:
- "Falling fast, grab snack"
- "Dropping, heads up"
- "Going low, snack time"

Observations:
- "More insulin than usual"
- "Bouncing around today"
- "Calmer than yesterday"
- "Steadier than usual"

Empathy:
- "Rough patch, hang in"
- "Diabetes is hard"
- "Tomorrow's fresh"

BAD EXAMPLES:
- "Avg 142 TIR 78% grt job" (too abbreviated, robotic)
- "**Key Findings:**" (markdown formatting)
- "Your glucose levels have been relatively stable" (too long, clinical)

Numbers are welcome but not required. Natural, human language is better than compressed abbreviations.

First fetch the glucose and treatment data, then store a warm, concise insight.
Use storeInsight with type="hourly". Must be 30 characters or less.`;

    const response = await invokeAgent(initialPrompt, sessionId);
    console.log("Agent response:", response);

    // The agent should have called storeInsight via the tool
    // If it didn't, store a fallback insight (case-insensitive check)
    const lowerResponse = response.toLowerCase();
    if (!lowerResponse.includes("stored") && !lowerResponse.includes("insight")) {
      const insightText = extractInsightFromResponse(response);
      if (insightText) {
        await storeInsight(
          docClient,
          Resource.SignageTable.name,
          DEFAULT_USER_ID,
          "hourly",
          insightText.slice(0, MAX_INSIGHT_LENGTH)
        );
      }
    }

    // Check if the stored insight is valid (length + quality) and retry if needed
    await enforceInsightQuality(sessionId);

    console.log("Stream-triggered analysis complete");
  } catch (error) {
    console.error("Stream-triggered analysis error:", error);
    // Rethrow to trigger Lambda retry mechanism for transient errors
    throw error;
  }
};

/**
 * Invoke the diabetes analyst agent with a prompt
 */
async function invokeAgent(prompt: string, sessionId: string): Promise<string> {
  const agentId = process.env.AGENT_ID;
  const agentAliasId = process.env.AGENT_ALIAS_ID;

  if (!agentId || !agentAliasId) {
    throw new Error("AGENT_ID and AGENT_ALIAS_ID must be set");
  }

  const response = await bedrockClient.send(
    new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    })
  );

  // Collect response chunks
  let responseText = "";
  if (response.completion) {
    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        responseText += new TextDecoder().decode(chunk.chunk.bytes);
      }
    }
  }

  return responseText;
}

/**
 * Check the stored insight and fix if too long or invalid
 */
async function enforceInsightQuality(sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_SHORTEN_ATTEMPTS; attempt++) {
    const insight = await getCurrentInsight(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID
    );

    if (!insight) {
      console.log("No insight found to check");
      return;
    }

    // Only fix hourly insights
    if (insight.type !== "hourly") {
      console.log(`Skipping quality check for ${insight.type} insight`);
      return;
    }

    const contentLength = insight.content.length;
    const valid = isValidInsight(insight.content);
    console.log(`Insight check: "${insight.content}" (${contentLength} chars, valid=${valid})`);

    // Check both length AND quality
    if (contentLength <= MAX_INSIGHT_LENGTH && valid) {
      console.log("Insight OK");
      return;
    }

    // Insight needs fixing
    const issue = !valid ? "INVALID (missing data or has markdown)" : "TOO LONG";
    console.log(`Insight ${issue}, asking agent to fix (attempt ${attempt + 1}/${MAX_SHORTEN_ATTEMPTS})`);

    const fixPrompt = `The insight you stored doesn't work for my LED display.

Current: "${insight.content}"
Problem: ${!valid ? "Contains markdown or isn't a real insight" : `Too long (${contentLength} chars, max ${MAX_INSIGHT_LENGTH})`}

Try again with a short, encouraging insight like:
- "In range all day!"
- "Steady overnight, nice!"
- "Running high, check it"

Natural language, no markdown, max ${MAX_INSIGHT_LENGTH} characters.
Store using storeInsight with type="hourly".`;

    const response = await invokeAgent(fixPrompt, sessionId);
    console.log("Fix response:", response);
  }

  // After max attempts, generate a fallback
  const finalInsight = await getCurrentInsight(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID
  );

  if (finalInsight && finalInsight.type === "hourly") {
    const needsFix = finalInsight.content.length > MAX_INSIGHT_LENGTH || !isValidInsight(finalInsight.content);
    if (needsFix) {
      console.warn(`Insight still invalid after ${MAX_SHORTEN_ATTEMPTS} attempts, using fallback`);
      await storeInsight(
        docClient,
        Resource.SignageTable.name,
        DEFAULT_USER_ID,
        "hourly",
        "Data updated chk app"
      );
    }
  }
}

/**
 * Check if an insight is valid (not garbage)
 */
function isValidInsight(content: string): boolean {
  const trimmed = content.trim();

  // Reject empty or too short
  if (trimmed.length < 8) return false;

  // Reject markdown headers
  if (trimmed.startsWith("#") || trimmed.startsWith("**")) return false;

  // Reject lines that are just labels
  if (trimmed.endsWith(":")) return false;

  // Reject JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;

  // Reject obvious non-insights
  if (trimmed.toLowerCase().includes("key findings")) return false;
  if (trimmed.toLowerCase().includes("analysis")) return false;

  return true;
}

/**
 * Extract insight text from agent response
 */
function extractInsightFromResponse(response: string): string | null {
  const lines = response.split("\n").filter((l) => l.trim());

  // Look for a valid insight line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length <= MAX_INSIGHT_LENGTH && isValidInsight(trimmed)) {
      return trimmed;
    }
  }

  // No valid insight found
  return null;
}
