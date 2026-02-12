/**
 * Stream-Triggered Analysis Lambda
 *
 * Triggered by DynamoDB Streams when new diabetes data arrives.
 * Filters for relevant record types, applies freshness and debounce checks,
 * then invokes the Bedrock Agent to generate insights for the display.
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { createDocClient, storeInsight, getCurrentInsight, updateCurrentInsightReasoning, getCurrentLocalTime, queryByTypeAndTimeRange } from "@diabetes/core";
import type { DynamoDBStreamHandler } from "aws-lambda";
import type { CgmReading } from "@diabetes/core";

const bedrockClient = new BedrockAgentRuntimeClient({});
const docClient = createDocClient();

const DEFAULT_USER_ID = "john";

// LED display fits 30 characters (2 lines x 15 chars)
const MAX_INSIGHT_LENGTH = 30;
const MAX_SHORTEN_ATTEMPTS = 2;

// Only CGM records trigger analysis — other types lack glucose values
const TRIGGER_TYPES = new Set(["CGM"]);

// Only analyze fresh data (skip historical backfills from Glooko)
const FRESHNESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// Rate limiting: generate a new insight only when conditions are met
const INSIGHT_INTERVAL_MS = 60 * 60_000; // 60 minutes between insights
const RAPID_CHANGE_THRESHOLD = 15; // mg/dL between consecutive CGM readings
const DRIFT_THRESHOLD = 30; // mg/dL change from last insight glucose
const ZONE_CHANGE_COOLDOWN_MS = 15 * 60_000; // 15 min cooldown for zone-only triggers

type InsightZone = "low" | "caution" | "in-range" | "high";

/**
 * Classify glucose into zones for trigger evaluation
 */
function getInsightZone(glucose: number): InsightZone {
  if (glucose < 70) return "low";
  if (glucose < 85) return "caution";
  if (glucose <= 180) return "in-range";
  return "high";
}

interface TriggerResult {
  shouldGenerate: boolean;
  reasons: string[];
}

/**
 * Evaluate whether a new insight should be generated based on four trigger conditions:
 * 1. Time elapsed >= 60 min since last hourly insight
 * 2. Rapid change >= 15 mg/dL between consecutive CGM readings
 * 3. Gradual drift >= 30 mg/dL from last insight glucose
 * 4. Zone change (current zone differs from last insight zone)
 */
function shouldGenerateInsight(input: {
  currentGlucose: number;
  previousGlucose: number | null;
  lastInsight: {
    generatedAt: number;
    type: string;
    glucoseAtGeneration?: number;
    zoneAtGeneration?: string;
  } | null;
  now: number;
}): TriggerResult {
  const { currentGlucose, previousGlucose, lastInsight, now } = input;
  const reasons: string[] = [];

  // Cold start: no previous hourly insight or missing glucose data
  if (
    !lastInsight ||
    lastInsight.type !== "hourly" ||
    lastInsight.glucoseAtGeneration === undefined
  ) {
    return { shouldGenerate: true, reasons: ["first-hourly"] };
  }

  const elapsed = now - lastInsight.generatedAt;

  // Trigger 1: Time elapsed >= 60 min
  if (elapsed >= INSIGHT_INTERVAL_MS) {
    reasons.push("time-elapsed");
  }

  // Trigger 2: Rapid change >= 15 mg/dL between consecutive readings
  if (previousGlucose !== null) {
    const delta = Math.abs(currentGlucose - previousGlucose);
    if (delta >= RAPID_CHANGE_THRESHOLD) {
      reasons.push("rapid-change");
    }
  }

  // Trigger 3: Gradual drift >= 30 mg/dL from last insight glucose
  const drift = Math.abs(currentGlucose - lastInsight.glucoseAtGeneration);
  if (drift >= DRIFT_THRESHOLD) {
    reasons.push("drift");
  }

  // Trigger 4: Zone change
  const currentZone = getInsightZone(currentGlucose);
  if (lastInsight.zoneAtGeneration && currentZone !== lastInsight.zoneAtGeneration) {
    reasons.push("zone-change");
  }

  // Zone oscillation cooldown: if ONLY zone-change triggered and elapsed < 15 min, skip
  if (
    reasons.length === 1 &&
    reasons[0] === "zone-change" &&
    elapsed < ZONE_CHANGE_COOLDOWN_MS
  ) {
    return { shouldGenerate: false, reasons: [] };
  }

  return { shouldGenerate: reasons.length > 0, reasons };
}

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

  // Extract current glucose from the most recent CGM record in the batch
  let currentGlucose: number | null = null;
  for (const record of relevantRecords) {
    const glucoseVal = record.dynamodb?.NewImage?.data?.M?.glucoseMgDl?.N;
    if (glucoseVal) {
      currentGlucose = Number(glucoseVal);
    }
  }

  if (currentGlucose === null) {
    console.log("No glucose value in stream records, skipping");
    return;
  }

  // Get current insight for trigger evaluation
  const currentInsight = await getCurrentInsight(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID
  );

  // Query previous CGM reading for consecutive delta
  let previousGlucose: number | null = null;
  try {
    const recentReadings = await queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "cgm",
      now - 60 * 60_000, // look back 1 hour
      now,
      2 // get 2 most recent
    );
    // The most recent is the one we just inserted, so take the second
    if (recentReadings.length >= 2) {
      const prev = recentReadings[1] as CgmReading;
      previousGlucose = prev.glucoseMgDl;
    }
  } catch {
    // Non-critical: proceed without previous reading
    console.log("Could not query previous CGM reading");
  }

  // Evaluate trigger conditions
  const currentZone = getInsightZone(currentGlucose);
  const elapsed = currentInsight ? now - currentInsight.generatedAt : 0;
  const drift = currentInsight?.glucoseAtGeneration !== undefined
    ? Math.abs(currentGlucose - currentInsight.glucoseAtGeneration)
    : 0;
  const delta = previousGlucose !== null
    ? currentGlucose - previousGlucose
    : 0;

  const triggerResult = shouldGenerateInsight({
    currentGlucose,
    previousGlucose,
    lastInsight: currentInsight,
    now,
  });

  if (!triggerResult.shouldGenerate) {
    console.log(
      `Insight skipped: glucose=${currentGlucose} zone=${currentZone} elapsed=${Math.round(elapsed / 60_000)}min delta=${delta > 0 ? "+" : ""}${delta} drift=${drift}`
    );
    return;
  }

  console.log(
    `Insight triggered: ${triggerResult.reasons.join(",")} | glucose=${currentGlucose} zone=${currentZone} elapsed=${Math.round(elapsed / 60_000)}min delta=${delta > 0 ? "+" : ""}${delta} drift=${drift}`
  );

  // Run comprehensive analysis for the sign's two-line insight
  const sessionId = `stream-${now}`;

  try {
    // Prompt the agent to generate a concise insight
    const localTime = getCurrentLocalTime();
    const initialPrompt = `Generate a SHORT insight for my LED display (max 30 characters).

CURRENT LOCAL TIME: ${localTime} (Pacific Time)

STEP 1 - GATHER DATA:
- Call getInsightHistory(days=1) to see recent insights
- Call getGlucoseStats(period="day") for today's data
- Look at CURRENT glucose value, trend direction, and recent trajectory

STEP 2 - DECIDE WHAT TO SAY:

Ask yourself: "What is the current story? What pattern or situation
best describes what's happening?"

This insight will display for up to 60 minutes. Write about the
situation or pattern, not the exact moment. Avoid narrow time references
like "right now" or "just happened". Instead use broader descriptions:
"steady afternoon", "trending up since lunch", "smooth overnight".

If glucose needs action → give a gentle suggestion as a question
If glucose is fine → say something SPECIFIC about what's going well

CRITICAL RULES:

**NEVER REPEAT.** Check your recent history. If you said something similar
in the last 6 hours, you MUST say something different. The system will
reject exact duplicates, but YOU should also avoid near-duplicates.

**BE SPECIFIC, NOT GENERIC.** Every insight must reference something
concrete about the current situation:
- Time of day ("afternoon" "evening" "overnight")
- What's been happening ("after lunch" "post-correction")
- A comparison ("vs yesterday" "vs this morning")
- A pattern ("for 2 hours" "since dinner" "all afternoon")

Generic praise like "Great job!" or "Best day!" is BANNED unless you
include WHY (e.g., "Best afternoon all week!").

**TRAJECTORY OVER VALUE.** Think: where will glucose be in 15 minutes?
- 80 and rising = great, celebrate
- 80 and dropping = concerning, suggest action
- 200 but falling fast = patience, it's working
- 150 and flat for hours = maybe needs a nudge

**NEAR-LOW CAUTION (under 85):**
- Still dropping (even slowly) = suggest more sugar, use [red] or [yellow]
- Actually flat for 2-3 readings = OK to say it's leveling
- Rising after treatment = "Coming back up" (don't say "landed" until flat)

**POST-LOW REBOUNDS:**
- Rising +20/reading after a low = rebound risk, don't celebrate yet
- Rising +5-10/reading = gentle recovery, OK to be positive
- Flat (±3) for 2-3 readings = actually landed, NOW celebrate

STEP 3 - WRITE IT (max 30 chars):
- Write like a friend texting, not a medical device
- NO abbreviations (avg, hi, TIR, hrs) — use real words
- NO exact numbers (say "high" not "241")
- Questions for suggestions ("bolus?" not "need bolus")

COLOR (wrap ENTIRE message in ONE color tag):
[green] = things going well | [yellow] = heads up, gentle nudge
[red] = act now | [rainbow] = rare milestones only

STEP 4 - STORE:
Call storeInsight with:
- type="hourly"
- content="[color]Your message[/]" (max 30 chars)
- reasoning="Brief explanation of why you chose this over alternatives"

The reasoning parameter is MANDATORY.`;

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

    // Set glucoseAtGeneration and zoneAtGeneration on the stored insight
    // These fields enable rate-limiting trigger evaluation for future readings
    try {
      const insightKeys = await getCurrentInsight(
        docClient,
        Resource.SignageTable.name,
        DEFAULT_USER_ID
      );
      if (insightKeys) {
        await docClient.send(
          new UpdateCommand({
            TableName: Resource.SignageTable.name,
            Key: { pk: `USR#${DEFAULT_USER_ID}#INSIGHT#CURRENT`, sk: "_" },
            UpdateExpression: "SET glucoseAtGeneration = :glucose, zoneAtGeneration = :zone",
            ExpressionAttributeValues: {
              ":glucose": currentGlucose,
              ":zone": currentZone,
            },
          })
        );
      }
    } catch (updateError) {
      // Non-critical: next reading will trigger cold-start path
      console.error("Failed to set glucose/zone on insight:", updateError);
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
