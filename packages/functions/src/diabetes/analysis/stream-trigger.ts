/**
 * Stream-Triggered Analysis Lambda
 *
 * Triggered by DynamoDB Streams when new diabetes data arrives.
 * Filters for relevant record types, applies freshness and debounce checks,
 * then invokes the Bedrock Agent to generate insights for the display.
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { Resource } from "sst";
import { createDocClient, storeInsight, getCurrentInsight, updateCurrentInsightReasoning } from "@diabetes/core";
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

STEP 2 - PICK ONE OF TWO CATEGORIES:

**CATEGORY A: ACTIONABLE TIP (what to do in the next 1-2 hours)**
Based on CURRENT glucose + trend + time of day, suggest something helpful:
- Rising after meal? "Still climbing, correction?"
- Dropping toward low? "Trending down, snack?"
- High for a while? "Been high, bolus time?"
- About to eat? "Pre-bolus for lunch?"
- Bedtime + high? "High before bed, correct?"

**CATEGORY B: CELEBRATE RECENT WINS (affirm what's going well)**
Compare NOW to recent history and highlight improvements:
- "Down from yesterday!"
- "Smoother than last week!"
- "Great morning so far!"
- "Nailed that meal!"
- "Best day this week!"

URGENCY ASSESSMENT (critical for Category A):
Look at the RATE OF CHANGE over the last 3-4 readings, not just direction:
- ACCELERATING drop (falling faster each reading) = urgent, use [red]
- DECELERATING drop (falling slower, leveling off) = likely fine, use [green] to celebrate the landing
- ACCELERATING rise (climbing faster) = urgent, use [red]
- DECELERATING rise (slowing down) = patience, may not need action

Example: high→less high→almost normal→normal is DECELERATING - this is good!
Say "Leveling off nicely!" not "Still dropping, eat!"

Example: high→higher→even higher→way higher is ACCELERATING - this needs action.

PRIORITIZE: Only use Category A with [red] if truly urgent (accelerating toward danger).
If stable or decelerating toward a good range, celebrate with Category B.

STEP 3 - WRITE LIKE A HUMAN (max 30 chars):
- NEVER use abbreviations ("avg", "hi", "TIR", "hrs")
- NEVER use exact numbers (say "high" not "241", "dropping" not "-2")
- Use questions for suggestions ("bolus?" not "need bolus")
- Write like a caring friend texting you

COLOR (wrap ENTIRE message in ONE color):
[green] = wins, celebrations, in-range
[yellow] = gentle suggestions, caution
[red] = urgent action needed
[rainbow] = big milestones

GOOD EXAMPLES:
"[yellow]Still rising, correct?[/]"
"[red]Dropping fast, juice?[/]"
"[green]Smoother than yesterday![/]"
"[green]Nailed that meal![/]"
"[yellow]High before bed, bolus?[/]"
"[rainbow]Best week in months![/]"

BAD EXAMPLES (too vague, not actionable):
"[blue]Mornings are tough[/]" ← general commentary, not helpful NOW
"[yellow]Nights dip at 3am[/]" ← observation, not actionable
"[blue]Patterns detected[/]" ← meaningless without action

FORBIDDEN:
- General observations without action or celebration
- Repeating what you said in the last 2 days
- Exact glucose numbers
- Abbreviations ("avg", "TIR", "hi/lo")

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
    const wasRewritten = await enforceInsightQuality(sessionId);

    // Extract reasoning from agent response and update the insight
    // Skip if insight was rewritten (reasoning no longer matches the stored insight)
    if (!wasRewritten) {
      const reasoning = extractReasoningFromResponse(response);
      if (reasoning) {
        const existingInsight = await getCurrentInsight(
          docClient,
          Resource.SignageTable.name,
          DEFAULT_USER_ID
        );
        if (existingInsight) {
          await updateCurrentInsightReasoning(
            docClient,
            Resource.SignageTable.name,
            DEFAULT_USER_ID,
            reasoning
          );
          console.log("Stored reasoning:", reasoning.slice(0, 100) + "...");
        }
      }
    } else {
      console.log("Skipping reasoning update - insight was rewritten");
    }

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
 * Returns true if the insight was rewritten (original reasoning no longer applies)
 */
async function enforceInsightQuality(sessionId: string): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_SHORTEN_ATTEMPTS; attempt++) {
    const insight = await getCurrentInsight(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID
    );

    if (!insight) {
      console.log("No insight found to check");
      return false;
    }

    // Only fix hourly insights
    if (insight.type !== "hourly") {
      console.log(`Skipping quality check for ${insight.type} insight`);
      return false;
    }

    // Strip color markup for length calculation (markup doesn't count as visible chars)
    const visibleContent = stripColorMarkup(insight.content);
    const visibleLength = visibleContent.length;
    const valid = isValidInsight(insight.content);
    console.log(`Insight check: "${insight.content}" (${visibleLength} visible chars, valid=${valid})`);

    // Check both length AND quality (using visible length, not raw length)
    if (visibleLength <= MAX_INSIGHT_LENGTH && valid) {
      console.log("Insight OK");
      return false; // Not rewritten
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
      return true; // Rewritten with fallback
    }
  }

  // If we got here, the insight was rewritten by fix attempts
  return true;
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

/**
 * Extract reasoning from agent response text
 * The agent typically explains its reasoning in sections like "Why this insight:"
 */
function extractReasoningFromResponse(response: string): string | null {
  // Look for common reasoning section headers
  const reasoningPatterns = [
    /\*\*Why this insight[?:]?\*\*:?\s*([\s\S]*?)(?=\n\n|\n\*\*|$)/i,
    /Why this insight[?:]?\s*([\s\S]*?)(?=\n\n|\n\*\*|$)/i,
    /\*\*Reasoning[?:]?\*\*:?\s*([\s\S]*?)(?=\n\n|\n\*\*|$)/i,
  ];

  for (const pattern of reasoningPatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      // Clean up the reasoning text
      let reasoning = match[1].trim();
      // Remove markdown formatting
      reasoning = reasoning.replace(/\*\*/g, "").replace(/\*/g, "");
      // Truncate to 500 chars (schema limit)
      if (reasoning.length > 500) {
        reasoning = reasoning.slice(0, 497) + "...";
      }
      return reasoning;
    }
  }

  return null;
}
