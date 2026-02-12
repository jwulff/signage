/**
 * Daily Analysis Lambda
 *
 * Triggered at 6 AM Pacific to summarize the previous day's glucose management.
 * Pre-fetches yesterday's aggregation from DynamoDB and passes it inline to
 * Claude via Bedrock InvokeModel. No agent framework.
 */

import { Resource } from "sst";
import {
  createDocClient,
  storeInsight,
  getDailyAggregation,
  formatDateInTimezone,
} from "@diabetes/core";
import type { ScheduledHandler } from "aws-lambda";
import { invokeModel } from "./invoke-model.js";

const docClient = createDocClient();

const DEFAULT_USER_ID = "john";

const SYSTEM_PROMPT = `You are a friendly diabetes analyst for a Type 1 diabetic using an insulin pump.
Target range: 70-180 mg/dL. Time in range goal: >70%.

Your job: write a short daily summary for the Pixoo64 LED display.
The display fits ONLY 30 characters (2 lines x 15 chars). Count carefully.

Writing style:
- Write like a caring friend texting — warm, natural, specific
- NO abbreviations (avg, hi, TIR, hrs, chk, stdy, grt, ovrnt)
- Frame suggestions as questions ("bolus?" not "need bolus")
- Celebrate good days, gently note areas for improvement

Colors (wrap entire message in ONE tag):
[green] = great day | [yellow] = mixed day | [red] = tough day | [rainbow] = exceptional`;

/**
 * Daily analysis handler
 */
export const handler: ScheduledHandler = async () => {
  console.log("Daily analysis triggered");

  try {
    // Use timezone-aware date calculation (Lambda runs in UTC)
    const yesterdayMs = Date.now() - 24 * 60 * 60_000;
    const dateStr = formatDateInTimezone(yesterdayMs);

    // Pre-fetch yesterday's aggregation
    const agg = await getDailyAggregation(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      dateStr
    );

    if (!agg) {
      console.log(`No daily aggregation found for ${dateStr}, skipping`);
      return;
    }

    const userMessage = `## Yesterday's Summary (${dateStr})

Glucose: TIR ${agg.glucose.tir}% | Mean ${Math.round(agg.glucose.mean)} | Range ${agg.glucose.min}-${agg.glucose.max} | CV ${Math.round(agg.glucose.cv)}% | Readings: ${agg.glucose.readings}
Insulin: ${agg.insulin.totalBolus}u bolus (${agg.insulin.bolusCount} doses) | ${agg.insulin.totalBasal}u basal

Generate a SHORT daily summary (max 30 characters) for my LED display.
Highlight the key win or area to watch. Call the respond tool.`;

    const result = await invokeModel(SYSTEM_PROMPT, userMessage);
    console.log("Model response:", JSON.stringify(result));

    await storeInsight(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "daily",
      result.content,
      undefined, // metrics
      result.reasoning
    );

    console.log(`Daily insight stored: "${result.content}"`);
  } catch (error) {
    console.error("Daily analysis error:", error);
    throw error;
  }
};
