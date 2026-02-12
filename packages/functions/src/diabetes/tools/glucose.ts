/**
 * GlucoseDataTools Action Group
 *
 * Provides glucose data access for the Diabetes AI Analyst agent.
 * This Lambda handles Bedrock Agent action group invocations.
 */

import { Resource } from "sst";
import {
  createDocClient,
  queryByTypeAndTimeRange,
  calculateGlucoseStats,
  calculateTimeInRange,
  formatDateInTimezone,
  getStartOfDayInTimezone,
} from "@diabetes/core";
import type { CgmReading, BgReading } from "@diabetes/core";

// Default user ID (single-user for now)
const DEFAULT_USER_ID = "john";

// DynamoDB client
const docClient = createDocClient();

/**
 * Bedrock Agent action group event structure (OpenAPI-based)
 */
interface BedrockAgentEvent {
  messageVersion: string;
  agent: {
    name: string;
    id: string;
    alias: string;
    version: string;
  };
  inputText: string;
  sessionId: string;
  actionGroup: string;
  apiPath: string;  // For OpenAPI-based action groups
  httpMethod: string;
  parameters: Array<{
    name: string;
    type: string;
    value: string;
  }>;
}

/**
 * Bedrock Agent action group response structure (OpenAPI-based)
 */
interface BedrockAgentResponse {
  messageVersion: string;
  response: {
    actionGroup: string;
    apiPath: string;  // Must match input apiPath for OpenAPI-based action groups
    httpMethod: string;
    responseBody: {
      "application/json": {
        body: string;
      };
    };
  };
}

/**
 * Get parameter value from event
 */
function getParam(event: BedrockAgentEvent, name: string): string | undefined {
  const param = event.parameters?.find((p) => p.name === name);
  return param?.value;
}

/**
 * Format response for Bedrock Agent (OpenAPI-based action group)
 */
function formatResponse(
  event: BedrockAgentEvent,
  body: unknown
): BedrockAgentResponse {
  return {
    messageVersion: "1.0",
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      responseBody: {
        "application/json": {
          body: JSON.stringify(body),
        },
      },
    },
  };
}

/**
 * Get recent glucose readings
 */
async function getRecentGlucose(hours: number): Promise<{
  readings: Array<{ timestamp: number; glucoseMgDl: number; type: "cgm" | "bg" }>;
  count: number;
  latest?: { glucoseMgDl: number; timestamp: number };
}> {
  const now = Date.now();
  const startTime = now - hours * 60 * 60 * 1000;

  // Query both CGM and BG readings
  const [cgmReadings, bgReadings] = await Promise.all([
    queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "cgm",
      startTime,
      now
    ),
    queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "bg",
      startTime,
      now
    ),
  ]);

  // Combine and sort by timestamp
  const readings = [
    ...(cgmReadings as CgmReading[]).map((r) => ({
      timestamp: r.timestamp,
      glucoseMgDl: r.glucoseMgDl,
      type: "cgm" as const,
    })),
    ...(bgReadings as BgReading[]).map((r) => ({
      timestamp: r.timestamp,
      glucoseMgDl: r.glucoseMgDl,
      type: "bg" as const,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  return {
    readings,
    count: readings.length,
    latest: readings[0],
  };
}

/**
 * Get glucose statistics for a period
 */
async function getGlucoseStats(
  period: "day" | "week" | "month"
): Promise<{
  readingCount: number;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  cv: number;
  tir: number;
  tbr: number;
  tar: number;
  estimatedA1c: number;
  gmi: number;
}> {
  const now = Date.now();
  const periodHoursMap: Record<string, number> = { day: 24, week: 168, month: 720 };
  const periodHours = periodHoursMap[period] ?? 24; // Default to 24 hours if invalid
  const startTime = now - periodHours * 60 * 60 * 1000;

  const cgmReadings = (await queryByTypeAndTimeRange(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    "cgm",
    startTime,
    now
  )) as CgmReading[];

  return calculateGlucoseStats(cgmReadings);
}

/**
 * Validate YYYY-MM-DD date string
 */
function isValidDateString(date: string): boolean {
  if (!date || typeof date !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return !isNaN(new Date(date).getTime());
}

/**
 * Get time in range for a date range
 */
async function getTimeInRangeForRange(
  startDate: string,
  endDate: string
): Promise<{
  tir: number;
  tbr: number;
  tar: number;
  readingCount: number;
  periodDays: number;
}> {
  // queryByTypeAndTimeRange converts timestamps to date strings internally,
  // so we just need timestamps that land on the correct calendar dates
  const startTime = getStartOfDayInTimezone(startDate);
  const endTime = getStartOfDayInTimezone(endDate);

  const cgmReadings = (await queryByTypeAndTimeRange(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    "cgm",
    startTime,
    endTime
  )) as CgmReading[];

  const tir = calculateTimeInRange(cgmReadings);
  const stats = calculateGlucoseStats(cgmReadings);

  // Compute period from calendar day difference (inclusive)
  const dayDiff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (24 * 60 * 60 * 1000)
  );

  return {
    tir,
    tbr: stats.tbr,
    tar: stats.tar,
    readingCount: cgmReadings.length,
    periodDays: dayDiff + 1,
  };
}

/**
 * Lambda handler for GlucoseDataTools action group
 */
export async function handler(
  event: BedrockAgentEvent
): Promise<BedrockAgentResponse> {
  console.log("GlucoseDataTools invoked:", {
    apiPath: event.apiPath,
    httpMethod: event.httpMethod,
    parameters: event.parameters,
  });

  try {
    switch (event.apiPath) {
      case "/getRecentGlucose": {
        const hours = parseInt(getParam(event, "hours") || "4", 10);
        const result = await getRecentGlucose(Math.min(Math.max(hours, 1), 24));
        return formatResponse(event, result);
      }

      case "/getGlucoseStats": {
        const period = (getParam(event, "period") || "day") as "day" | "week" | "month";
        const result = await getGlucoseStats(period);
        return formatResponse(event, result);
      }

      case "/getTimeInRange": {
        const now = Date.now();
        const rawStart = getParam(event, "startDate");
        const rawEnd = getParam(event, "endDate");
        const startDate = rawStart && isValidDateString(rawStart) ? rawStart : formatDateInTimezone(now);
        const endDate = rawEnd && isValidDateString(rawEnd) ? rawEnd : formatDateInTimezone(now);
        const result = await getTimeInRangeForRange(startDate, endDate);
        return formatResponse(event, result);
      }

      default:
        return formatResponse(event, {
          error: `Unknown API path: ${event.apiPath}`,
        });
    }
  } catch (error) {
    console.error("GlucoseDataTools error:", error);
    return formatResponse(event, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
