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
 * Strip color markup from text for length/validation calculations
 * e.g., "[green]Hello[/] world" -> "Hello world"
 */
function stripColorMarkup(text: string): string {
  return text.replace(/\[(\w+)\](.*?)\[\/\]/g, "$2").replace(/\[\w+\]/g, "").replace(/\[\/\]/g, "");
}

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
    const initialPrompt = `Generate a thoughtful insight for my LED display (max 30 characters).

STEP 1 - GATHER CONTEXT (do this first!):
- Call getInsightHistory(days=2) to see recent insights - DON'T repeat them
- Call getGlucoseStats(period="day") and getGlucoseStats(period="week") for trends
- Call getDailyAggregation() for hourly patterns today
- Call detectPatterns(type="all") for recurring issues

STEP 2 - THINK ABOUT WHAT'S INTERESTING:
- How does TODAY compare to THIS WEEK? Better or worse?
- Any time-of-day patterns? (morning highs, overnight lows, post-meal spikes)
- Any multi-day trends? (improving control, more variability lately)
- What would be GENUINELY USEFUL to know right now?
- What HAVEN'T I said recently? Don't repeat recent insights!

STEP 3 - WRITE LIKE A HUMAN (max 30 chars):
- NEVER use abbreviations ("avg", "hi", "TIR", "hrs")
- NEVER use exact numbers (say "over 200" not "241")
- Use questions, not commands ("bolus?" not "need bolus")
- Write like a caring friend texting you

VARIETY IDEAS (pick what's most relevant AND different from recent):
- Time patterns: "Mornings are tough" / "Nights looking better"
- Trend observations: "Steadier than yesterday" / "Best week in a while"
- Gentle suggestions: "Big dinner, bolus?" / "Dropping, maybe eat?"
- Celebrations: "In range all day!" / "Great overnight!"

COLOR (wrap ENTIRE message in ONE color):
[green] = wins, in-range | [yellow] = caution, highs | [red] = urgent, lows
[blue] = observations/trends | [rainbow] = big celebrations

EXAMPLES:
"[green]Better than yesterday![/]"
"[green]Steady overnight![/]"
"[yellow]Mornings are tricky[/]"
"[blue]More stable this week[/]"
"[red]Dropping fast, eat?[/]"
"[rainbow]Best day this week![/]"

FORBIDDEN:
- Repeating what you said in the last 2 days
- Exact glucose numbers (say "over 200" not "241")
- Abbreviations ("avg", "TIR", "hi/lo")
- Commands ("need bolus") - use questions ("bolus?")

STEP 4 - STORE WITH REASONING (ALL 3 PARAMETERS REQUIRED):
Call storeInsight with ALL of these:
- type="hourly"
- content="[color]Your insight text[/]" (max 30 chars)
- reasoning="YOUR EXPLANATION HERE" ← DO NOT SKIP THIS

The reasoning parameter is MANDATORY. Example:
reasoning="Checked history: said 'Nights dip at 3am' 2hrs ago. Today TIR 57% vs week 65%. Morning pattern detected 7x 5-8am. Chose morning observation since it's actionable and different from recent."

Without reasoning, we can't improve the prompts. ALWAYS include it.`;

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

    // Strip color markup for length calculation (markup doesn't count as visible chars)
    const visibleContent = stripColorMarkup(insight.content);
    const visibleLength = visibleContent.length;
    const valid = isValidInsight(insight.content);
    console.log(`Insight check: "${insight.content}" (${visibleLength} visible chars, valid=${valid})`);

    // Check both length AND quality (using visible length, not raw length)
    if (visibleLength <= MAX_INSIGHT_LENGTH && valid) {
      console.log("Insight OK");
      return;
    }

    // Insight needs fixing
    const issue = !valid ? "INVALID (missing data or has markdown)" : "TOO LONG";
    console.log(`Insight ${issue}, asking agent to fix (attempt ${attempt + 1}/${MAX_SHORTEN_ATTEMPTS})`);

    const fixPrompt = `The insight you stored doesn't work for my LED display.

Current: "${insight.content}"
Problem: ${!valid ? "Contains markdown or isn't a real insight" : `Too long (${visibleLength} visible chars, max ${MAX_INSIGHT_LENGTH})`}

Try again. Write like a HUMAN, not a robot:
- "[green]In range all day![/]"
- "[yellow]Been high a while[/]"
- "[red]Dropping fast, eat![/]"

NO abbreviations. NO cramming numbers. Sound like a caring friend.
ONE color, max ${MAX_INSIGHT_LENGTH} chars. storeInsight type="hourly".`;

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

  // Strip color markup for validation (e.g., [green]text[/] -> text)
  const withoutMarkup = trimmed.replace(/\[(\w+)\](.*?)\[\/\]/g, "$2").replace(/\[\w+\]/g, "").replace(/\[\/\]/g, "");

  // Reject empty or too short (after stripping markup)
  if (withoutMarkup.length < 8) return false;

  // Reject markdown headers
  if (withoutMarkup.startsWith("#") || withoutMarkup.startsWith("**")) return false;

  // Reject lines that are just labels
  if (withoutMarkup.endsWith(":")) return false;

  // Reject JSON (but allow color markup which also starts with [)
  // Color markup starts with [word] not [{ or ["
  if (trimmed.startsWith("{")) return false;
  if (trimmed.startsWith("[") && !trimmed.match(/^\[\w+\]/)) return false;

  // Reject obvious non-insights
  if (withoutMarkup.toLowerCase().includes("key findings")) return false;
  if (withoutMarkup.toLowerCase().includes("analysis")) return false;

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
