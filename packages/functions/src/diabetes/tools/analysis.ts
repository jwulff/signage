/**
 * AnalysisTools Action Group
 *
 * Provides aggregation and pattern detection for the Diabetes AI Analyst agent.
 */

import { Resource } from "sst";
import {
  createDocClient,
  queryByTypeAndTimeRange,
  detectOvernightLowPattern,
  detectPostMealSpikePattern,
  detectMorningHighPattern,
  detectAllPatterns,
  calculateGlucoseStats,
  getStartOfDayInTimezone,
} from "@diabetes/core";
import type { CgmReading, BolusRecord } from "@diabetes/core";

// Default user ID (single-user for now)
const DEFAULT_USER_ID = "john";

// DynamoDB client
const docClient = createDocClient();

/**
 * Bedrock Agent event types (OpenAPI-based action groups)
 */
interface BedrockAgentEvent {
  messageVersion: string;
  agent: { name: string; id: string; alias: string; version: string };
  inputText: string;
  sessionId: string;
  actionGroup: string;
  apiPath: string;
  httpMethod: string;
  parameters: Array<{ name: string; type: string; value: string }>;
}

interface BedrockAgentResponse {
  messageVersion: string;
  response: {
    actionGroup: string;
    apiPath: string;
    httpMethod: string;
    responseBody: { "application/json": { body: string } };
  };
}

function getParam(event: BedrockAgentEvent, name: string): string | undefined {
  return event.parameters.find((p) => p.name === name)?.value;
}

function formatResponse(event: BedrockAgentEvent, body: unknown): BedrockAgentResponse {
  return {
    messageVersion: "1.0",
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      responseBody: { "application/json": { body: JSON.stringify(body) } },
    },
  };
}

/**
 * Validate date string is in YYYY-MM-DD format
 */
function isValidDateString(date: string): boolean {
  if (!date || typeof date !== "string") return false;
  const match = date.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return false;
  // Verify it parses to a valid date
  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
}

/**
 * Get daily aggregation for a specific date
 */
async function getDailyAggregation(date: string): Promise<{
  date: string;
  stats: {
    readingCount: number;
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    cv: number;
    tir: number;
    tbr: number;
    tar: number;
  };
  hourlyBreakdown: Array<{
    hour: number;
    readingCount: number;
    mean: number;
  }>;
}> {
  // Validate and default the date
  const validDate = isValidDateString(date) ? date : new Date().toISOString().split("T")[0];

  // Compute daily window in data timezone (America/Los_Angeles)
  const startTime = getStartOfDayInTimezone(validDate);
  const endTime = startTime + 24 * 60 * 60 * 1000;

  const cgmReadings = (await queryByTypeAndTimeRange(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    "cgm",
    startTime,
    endTime
  )) as CgmReading[];

  const stats = calculateGlucoseStats(cgmReadings);

  // Calculate hourly breakdown
  const hourlyMap = new Map<number, CgmReading[]>();
  for (const reading of cgmReadings) {
    const hour = new Date(reading.timestamp).getHours();
    if (!hourlyMap.has(hour)) hourlyMap.set(hour, []);
    hourlyMap.get(hour)!.push(reading);
  }

  const hourlyBreakdown = Array.from(hourlyMap.entries())
    .map(([hour, readings]) => ({
      hour,
      readingCount: readings.length,
      mean: Math.round(
        readings.reduce((sum, r) => sum + r.glucoseMgDl, 0) / readings.length
      ),
    }))
    .sort((a, b) => a.hour - b.hour);

  return { date: validDate, stats, hourlyBreakdown };
}

/**
 * Get weekly aggregation for a specific week
 */
async function getWeeklyAggregation(weekOffset: number = 0): Promise<{
  weekStart: string;
  weekEnd: string;
  stats: {
    readingCount: number;
    mean: number;
    min: number;
    max: number;
    tir: number;
    tbr: number;
    tar: number;
  };
  dailyBreakdown: Array<{
    date: string;
    dayOfWeek: string;
    readingCount: number;
    mean: number;
    tir: number;
  }>;
}> {
  // Calculate week boundaries (Monday-Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset - weekOffset * 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const cgmReadings = (await queryByTypeAndTimeRange(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    "cgm",
    weekStart.getTime(),
    weekEnd.getTime()
  )) as CgmReading[];

  const stats = calculateGlucoseStats(cgmReadings);

  // Calculate daily breakdown
  const dailyMap = new Map<string, CgmReading[]>();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (const reading of cgmReadings) {
    const dateStr = new Date(reading.timestamp).toISOString().split("T")[0];
    if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, []);
    dailyMap.get(dateStr)!.push(reading);
  }

  const dailyBreakdown = Array.from(dailyMap.entries())
    .map(([date, readings]) => {
      const dayStats = calculateGlucoseStats(readings);
      const d = new Date(date);
      return {
        date,
        dayOfWeek: dayNames[d.getDay()],
        readingCount: readings.length,
        mean: dayStats.mean,
        tir: dayStats.tir,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    weekStart: weekStart.toISOString().split("T")[0],
    weekEnd: new Date(weekEnd.getTime() - 1).toISOString().split("T")[0],
    stats,
    dailyBreakdown,
  };
}

/**
 * Detect patterns in glucose data
 */
async function detectPatterns(
  patternType: "meal" | "overnight" | "correction" | "all"
): Promise<{
  patternType: string;
  patterns: Array<{
    type: string;
    description: string;
    occurrences: number;
    avgTiming: string;
    severity: string;
    suggestedAction: string;
    confidence: number;
  }>;
  analysisWindow: {
    start: string;
    end: string;
    days: number;
  };
}> {
  // Analyze last 14 days for better pattern detection
  const days = 14;
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  const [cgmReadings, boluses] = await Promise.all([
    queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "cgm",
      startTime,
      endTime
    ) as Promise<CgmReading[]>,
    queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "bolus",
      startTime,
      endTime
    ) as Promise<BolusRecord[]>,
  ]);

  const patterns: Array<{
    type: string;
    description: string;
    occurrences: number;
    avgTiming: string;
    severity: string;
    suggestedAction: string;
    confidence: number;
  }> = [];

  // Use detectAllPatterns if requesting all, otherwise filter by type
  if (patternType === "all") {
    const allPatterns = detectAllPatterns(cgmReadings, boluses, days);
    for (const p of allPatterns) {
      patterns.push({
        type: p.patternType,
        description: `${p.occurrences} ${p.patternType.replace(/_/g, " ")} events detected`,
        occurrences: p.occurrences,
        avgTiming: p.avgTiming,
        severity: p.severity,
        suggestedAction: p.suggestedAction,
        confidence: p.confidence,
      });
    }
  } else {
    // Detect specific pattern type
    let pattern = null;

    if (patternType === "overnight") {
      pattern = detectOvernightLowPattern(cgmReadings, days);
    } else if (patternType === "meal") {
      pattern = detectPostMealSpikePattern(cgmReadings, boluses, days);
    } else if (patternType === "correction") {
      pattern = detectMorningHighPattern(cgmReadings, days);
    }

    if (pattern) {
      patterns.push({
        type: pattern.patternType,
        description: `${pattern.occurrences} ${pattern.patternType.replace(/_/g, " ")} events detected`,
        occurrences: pattern.occurrences,
        avgTiming: pattern.avgTiming,
        severity: pattern.severity,
        suggestedAction: pattern.suggestedAction,
        confidence: pattern.confidence,
      });
    }
  }

  return {
    patternType,
    patterns,
    analysisWindow: {
      start: new Date(startTime).toISOString().split("T")[0],
      end: new Date(endTime).toISOString().split("T")[0],
      days,
    },
  };
}

/**
 * Lambda handler for AnalysisTools action group
 */
export async function handler(
  event: BedrockAgentEvent
): Promise<BedrockAgentResponse> {
  console.log("AnalysisTools invoked:", {
    apiPath: event.apiPath,
    httpMethod: event.httpMethod,
    parameters: event.parameters,
  });

  try {
    switch (event.apiPath) {
      case "/getDailyAggregation": {
        const date = getParam(event, "date") || new Date().toISOString().split("T")[0];
        const result = await getDailyAggregation(date);
        return formatResponse(event, result);
      }

      case "/getWeeklyAggregation": {
        const weekOffset = parseInt(getParam(event, "weekOffset") || "0", 10);
        const result = await getWeeklyAggregation(weekOffset);
        return formatResponse(event, result);
      }

      case "/detectPatterns": {
        const patternType = (getParam(event, "type") || "all") as
          | "meal"
          | "overnight"
          | "correction"
          | "all";
        const result = await detectPatterns(patternType);
        return formatResponse(event, result);
      }

      default:
        return formatResponse(event, { error: `Unknown API path: ${event.apiPath}` });
    }
  } catch (error) {
    console.error("AnalysisTools error:", error);
    return formatResponse(event, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
