/**
 * Stream-Triggered Analysis Lambda
 *
 * Triggered by DynamoDB Streams when new diabetes data arrives.
 * Filters for relevant record types, applies freshness and debounce checks,
 * then calls Claude via Bedrock InvokeModel to generate insights for the display.
 *
 * All data is pre-fetched from DynamoDB and passed inline in the prompt.
 * The model returns structured JSON via forced tool_use — no agent framework.
 */

import { Resource } from "sst";
import {
  createDocClient,
  storeInsight,
  getCurrentInsight,
  getCurrentLocalTime,
  queryByTypeAndTimeRange,
  calculateGlucoseStats,
  getInsightHistory,
  getRecentInsightContents,
} from "@diabetes/core";
import type { DynamoDBStreamHandler } from "aws-lambda";
import type { CgmReading, InsightZone, BolusRecord } from "@diabetes/core";
import { invokeModel } from "./invoke-model.js";
import { stripMarkup } from "./insight-utils.js";

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
    zoneAtGeneration?: InsightZone;
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

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are a friendly diabetes analyst for a Type 1 diabetic using an insulin pump.
Target range: 70-180 mg/dL. Time in range goal: >70%.

Your job: analyze glucose data and write a short insight for the Pixoo64 LED display.
The display fits ONLY 30 characters (2 lines x 15 chars). Count carefully.

Writing style:
- Write like a caring friend texting — warm, natural, specific
- NO abbreviations (avg, hi, TIR, hrs, chk, stdy, grt, ovrnt)
- NO exact glucose numbers (say "high" not "241")
- Frame suggestions as questions ("bolus?" not "need bolus")
- Your insights display on the LED for up to 60 minutes — write about the current situation or pattern, not the current moment
- Prefer broader time descriptions ("steady afternoon", "smooth since lunch") over narrow ones ("right now", "just happened")
- NEVER repeat a recent insight — always say something new

Colors (wrap entire message in ONE tag):
[green] = wins, in-range | [yellow] = caution, nudge | [red] = act now | [rainbow] = rare milestone`;

// =============================================================================
// Handler
// =============================================================================

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

  // Extract current glucose and timestamp from the most recent CGM record in the batch
  // When multiple readings arrive in a single batch, pick the one with the latest timestamp
  let currentGlucose: number | null = null;
  let streamRecordTimestamp: number | null = null;
  for (const record of relevantRecords) {
    const glucoseVal = record.dynamodb?.NewImage?.data?.M?.glucoseMgDl?.N;
    const tsVal = record.dynamodb?.NewImage?.timestamp?.N;
    if (glucoseVal && tsVal) {
      const tsNum = Number(tsVal);
      if (streamRecordTimestamp === null || tsNum > streamRecordTimestamp) {
        currentGlucose = Number(glucoseVal);
        streamRecordTimestamp = tsNum;
      }
    } else if (glucoseVal && currentGlucose === null && streamRecordTimestamp === null) {
      currentGlucose = Number(glucoseVal);
    }
  }
  if (streamRecordTimestamp === null) {
    streamRecordTimestamp = now;
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
      streamRecordTimestamp - 60 * 60_000,
      streamRecordTimestamp - 1,
      1
    );
    if (recentReadings.length >= 1) {
      const prev = recentReadings[0] as CgmReading;
      previousGlucose = prev.glucoseMgDl;
    }
  } catch {
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

  try {
    // Pre-fetch all data for the prompt
    const [glucoseReadings, glucoseStats, insightHistory, recentInsightContents, treatmentReadings] =
      await Promise.all([
        queryByTypeAndTimeRange(
          docClient, Resource.SignageTable.name, DEFAULT_USER_ID,
          "cgm", now - 3 * 60 * 60_000, now
        ),
        queryByTypeAndTimeRange(
          docClient, Resource.SignageTable.name, DEFAULT_USER_ID,
          "cgm", now - 24 * 60 * 60_000, now
        ).then((readings) => calculateGlucoseStats(readings as CgmReading[])),
        getInsightHistory(docClient, Resource.SignageTable.name, DEFAULT_USER_ID, 1),
        getRecentInsightContents(docClient, Resource.SignageTable.name, DEFAULT_USER_ID, 6),
        queryByTypeAndTimeRange(
          docClient, Resource.SignageTable.name, DEFAULT_USER_ID,
          "bolus", now - 3 * 60 * 60_000, now
        ),
      ]);

    // Format glucose trajectory
    const cgmReadings = (glucoseReadings as CgmReading[]).sort((a, b) => b.timestamp - a.timestamp);
    const trajectoryLines = cgmReadings.map((r) => {
      const time = new Date(r.timestamp).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
      });
      return `${time}: ${r.glucoseMgDl}`;
    });

    // Format recent insights
    const insightLines = insightHistory.map((i) => {
      const time = new Date(i.generatedAt).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
      });
      return `[${time}] ${i.content}`;
    });

    // Format treatments (bolus records)
    const treatmentLines = (treatmentReadings as BolusRecord[]).map((t) => {
      const time = new Date(t.timestamp).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
      });
      const parts = [
        `${t.insulinDeliveredUnits}u`,
        t.carbsInputGrams > 0 ? `${t.carbsInputGrams}g carbs` : "",
        t.bolusType !== "Normal" ? t.bolusType : "",
      ].filter(Boolean);
      return `${time}: ${parts.join(" ")}`;
    });

    const localTime = getCurrentLocalTime();

    const userMessage = `## Current Context
Time: ${localTime} (Pacific) | Glucose: ${currentGlucose} mg/dL (${currentZone}) | Delta: ${delta > 0 ? "+" : ""}${delta} mg/dL

## 3-Hour Glucose Trajectory (most recent first)
${trajectoryLines.length > 0 ? trajectoryLines.join("  ") : "No readings available"}

## Today's Stats
TIR: ${glucoseStats.tir}% | Mean: ${Math.round(glucoseStats.mean)} | Range: ${glucoseStats.min}-${glucoseStats.max} | Readings: ${glucoseStats.readingCount}

## Recent Treatments (3hr)
${treatmentLines.length > 0 ? treatmentLines.join("  ") : "None"}

## Recent Insights (last day)
${insightLines.length > 0 ? insightLines.join("\n") : "None yet"}

Generate a SHORT insight for my LED display (max 30 characters).

STEP 1 - SUMMARIZE WHAT YOU SEE (do this before writing):
Before choosing what to say, state the facts from the data:
- What was glucose 3 hours ago? 2 hours ago? 1 hour ago? Now?
- Each reading is 5 minutes apart. 12 readings = 1 hour. Do the math.
- What is the overall shape? (flat, rising, falling, V-shape, spike, dip)
- When did the current trend START? (count the readings, multiply by 5 min)
- Is glucose in-range (70-180), above, or below?

STEP 2 - DECIDE WHAT TO SAY:

Based on your summary, ask: "What is the real story here?"

This insight will display for up to 60 minutes. Write about the
situation or pattern, not the exact moment. Avoid narrow time references
like "right now" or "just happened". Instead use broader descriptions:
"steady afternoon", "trending up since lunch", "smooth overnight".

IMPORTANT: Do not claim a trend lasted longer than the data shows.
If only 5 readings are falling, that's ~25 minutes, not 90 minutes.

If glucose needs action -> give a gentle suggestion as a question
If glucose is fine -> say something SPECIFIC about what's going well

CRITICAL RULES:

**NEVER REPEAT.** Check your recent insights above. If you said something similar
in the last 6 hours, you MUST say something different.

**BE SPECIFIC, NOT GENERIC.** Every insight must reference something
concrete about the current situation:
- Time of day ("afternoon" "evening" "overnight")
- What's been happening ("after lunch" "post-correction")
- A pattern ("for 2 hours" "since dinner" "all afternoon")

Generic praise like "Great job!" is BANNED unless you include WHY.

**TRAJECTORY OVER VALUE.** Think: where will glucose be in 15 minutes?
- 80 and rising = great, celebrate
- 80 and dropping = concerning, suggest action
- 200 but falling fast = patience, it's working
- 150 and flat for hours = maybe needs a nudge

**NEAR-LOW CAUTION (under 85):**
- Still dropping = suggest more sugar, use [red] or [yellow]
- Flat for 2-3 readings = OK to say it's leveling
- Rising after treatment = "Coming back up" (don't say "landed" until flat)

STEP 3 - WRITE IT (max 30 chars):
- Write like a friend texting, not a medical device
- NO abbreviations (avg, hi, TIR, hrs) — use real words
- NO exact numbers (say "high" not "241")
- Questions for suggestions ("bolus?" not "need bolus")

COLOR (wrap ENTIRE message in ONE color tag):
[green] = things going well | [yellow] = heads up, gentle nudge
[red] = act now | [rainbow] = rare milestones only

Call the respond tool with content and reasoning.`;

    // Call the model
    let result = await invokeModel(SYSTEM_PROMPT, userMessage);
    console.log("Model response:", JSON.stringify(result));

    // Validate before storing
    let { content, reasoning } = result;
    for (let attempt = 0; attempt < MAX_SHORTEN_ATTEMPTS; attempt++) {
      const visibleContent = stripColorMarkup(content);
      const visibleLength = visibleContent.length;
      const valid = isValidInsight(content);

      if (visibleLength <= MAX_INSIGHT_LENGTH && valid) {
        break; // Insight is good
      }

      const issue = !valid ? "INVALID" : `TOO LONG (${visibleLength} chars)`;
      console.log(`Insight ${issue}: "${content}", retrying (attempt ${attempt + 1}/${MAX_SHORTEN_ATTEMPTS})`);

      const fixMessage = `The insight you wrote doesn't work for my LED display.

Current: "${content}"
Problem: ${!valid ? "Contains markdown or isn't a real insight" : `Too long (${visibleLength} visible chars, max ${MAX_INSIGHT_LENGTH})`}

Try again. Write like a HUMAN, not a robot:
- "[green]In range all day![/]"
- "[yellow]Been high a while[/]"
- "[red]Dropping fast, eat![/]"

NO abbreviations. NO cramming numbers. Sound like a caring friend.
ONE color, max ${MAX_INSIGHT_LENGTH} chars. Call the respond tool.`;

      result = await invokeModel(SYSTEM_PROMPT, fixMessage);
      content = result.content;
      reasoning = result.reasoning;
    }

    // Final validation — use fallback if still invalid
    const finalVisible = stripColorMarkup(content);
    if (finalVisible.length > MAX_INSIGHT_LENGTH || !isValidInsight(content)) {
      console.warn(`Insight still invalid after ${MAX_SHORTEN_ATTEMPTS} attempts, using fallback`);
      content = "[yellow]Check your app[/]";
      reasoning = "Fallback: model could not generate a valid insight within length constraints";
    }

    // Dedup check — reject if identical to recent insight
    const normalizedNew = stripMarkup(content);
    const isDuplicate = recentInsightContents.some((recent) => stripMarkup(recent) === normalizedNew);

    if (isDuplicate) {
      console.log(`Dedup: rejected duplicate insight "${content}", keeping existing`);
      return;
    }

    // Store insight with all metadata in a single call
    await storeInsight(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "hourly",
      content,
      undefined, // metrics
      reasoning,
      currentGlucose,
      currentZone
    );

    console.log(`Insight stored: "${content}" | reasoning: ${reasoning.slice(0, 100)}...`);
    console.log("Stream-triggered analysis complete");
  } catch (error) {
    console.error("Stream-triggered analysis error:", error);
    throw error;
  }
};

/**
 * Check if an insight is valid (not garbage)
 */
function isValidInsight(content: string): boolean {
  const trimmed = content.trim();

  // Strip color markup for validation
  const withoutMarkup = trimmed.replace(/\[(\w+)\](.*?)\[\/\]/g, "$2").replace(/\[\w+\]/g, "").replace(/\[\/\]/g, "");

  if (withoutMarkup.length < 8) return false;
  if (withoutMarkup.startsWith("#") || withoutMarkup.startsWith("**")) return false;
  if (withoutMarkup.endsWith(":")) return false;
  if (trimmed.startsWith("{")) return false;
  if (trimmed.startsWith("[") && !trimmed.match(/^\[\w+\]/)) return false;
  if (withoutMarkup.toLowerCase().includes("key findings")) return false;
  if (withoutMarkup.toLowerCase().includes("analysis")) return false;

  return true;
}
