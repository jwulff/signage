/**
 * Weekly Analysis Lambda
 *
 * Triggered Sunday at 8 AM Pacific to review weekly patterns and trends.
 * Pre-fetches the past 7 days of daily aggregations from DynamoDB and passes
 * them inline to Claude via Bedrock InvokeModel. No agent framework.
 */

import { Resource } from "sst";
import {
  createDocClient,
  storeInsight,
  getDailyAggregations,
  formatDateInTimezone,
} from "@diabetes/core";
import type { ScheduledHandler } from "aws-lambda";
import { invokeModel } from "./invoke-model.js";

const docClient = createDocClient();

const DEFAULT_USER_ID = "john";

const SYSTEM_PROMPT = `You are a friendly diabetes analyst for a Type 1 diabetic using an insulin pump.
Target range: 70-180 mg/dL. Time in range goal: >70%.

Your job: write a short weekly summary for the Pixoo64 LED display.
The display fits ONLY 30 characters (2 lines x 15 chars). Count carefully.

Writing style:
- Write like a caring friend texting — warm, natural, specific
- NO abbreviations (avg, hi, TIR, hrs, chk, stdy, grt, ovrnt)
- Highlight the week's trend or achievement
- Celebrate consistency, gently note patterns

Colors (wrap entire message in ONE tag):
[green] = great week | [yellow] = mixed week | [red] = tough week | [rainbow] = best week ever`;

/**
 * Weekly analysis handler
 */
export const handler: ScheduledHandler = async () => {
  console.log("Weekly analysis triggered");

  try {
    const now = Date.now();
    const weekAgoMs = now - 7 * 24 * 60 * 60_000;
    const startDate = formatDateInTimezone(weekAgoMs);
    const endDate = formatDateInTimezone(now);

    // Pre-fetch daily aggregations for the past week
    const dailyAggs = await getDailyAggregations(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      startDate,
      endDate
    );

    if (dailyAggs.length === 0) {
      console.log(`No daily aggregations found for ${startDate} to ${endDate}, skipping`);
      return;
    }

    // Format daily summaries for the prompt
    const dailyLines = dailyAggs.map((d) =>
      `${d.date}: TIR ${d.glucose.tir}% | Mean ${Math.round(d.glucose.mean)} | Range ${d.glucose.min}-${d.glucose.max} | ${d.glucose.readings} readings`
    );

    // Compute week-level stats
    const totalReadings = dailyAggs.reduce((sum, d) => sum + d.glucose.readings, 0);
    const weightedTir = dailyAggs.reduce((sum, d) => sum + d.glucose.tir * d.glucose.readings, 0) / totalReadings;
    const weekMean = dailyAggs.reduce((sum, d) => sum + d.glucose.mean * d.glucose.readings, 0) / totalReadings;
    const weekMin = Math.min(...dailyAggs.map((d) => d.glucose.min));
    const weekMax = Math.max(...dailyAggs.map((d) => d.glucose.max));

    const userMessage = `## Weekly Summary (${startDate} to ${endDate})

### Week Totals
TIR: ${Math.round(weightedTir)}% | Mean: ${Math.round(weekMean)} | Range: ${weekMin}-${weekMax} | Days: ${dailyAggs.length}

### Daily Breakdown
${dailyLines.join("\n")}

Generate a SHORT weekly summary (max 30 characters) for my LED display.
Highlight the week's trend or achievement. Call the respond tool.`;

    const result = await invokeModel(SYSTEM_PROMPT, userMessage);
    console.log("Model response:", JSON.stringify(result));

    await storeInsight(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "weekly",
      result.content,
      undefined, // metrics
      result.reasoning
    );

    console.log(`Weekly insight stored: "${result.content}"`);
  } catch (error) {
    console.error("Weekly analysis error:", error);
    throw error;
  }
};
