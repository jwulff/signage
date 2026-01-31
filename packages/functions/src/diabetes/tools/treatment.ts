/**
 * TreatmentDataTools Action Group
 *
 * Provides treatment data access (insulin, carbs) for the Diabetes AI Analyst agent.
 */

import { Resource } from "sst";
import {
  createDocClient,
  queryByTypeAndTimeRange,
  queryDailyInsulinByDateRange,
} from "@diabetes/core";
import type { BolusRecord, CarbsRecord, ManualInsulinRecord } from "@diabetes/core";

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
  return event.parameters?.find((p) => p.name === name)?.value;
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
 * Get recent treatments (insulin + carbs)
 */
async function getRecentTreatments(hours: number): Promise<{
  treatments: Array<{
    timestamp: number;
    type: "bolus" | "carbs" | "manual_insulin";
    insulin?: number;
    carbs?: number;
    bolusType?: string;
  }>;
  totalInsulin: number;
  totalCarbs: number;
  count: number;
}> {
  const now = Date.now();
  const startTime = now - hours * 60 * 60 * 1000;

  const [boluses, carbs, manualInsulin] = await Promise.all([
    queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "bolus",
      startTime,
      now
    ),
    queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "carbs",
      startTime,
      now
    ),
    queryByTypeAndTimeRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "manual_insulin",
      startTime,
      now
    ),
  ]);

  const treatments: Array<{
    timestamp: number;
    type: "bolus" | "carbs" | "manual_insulin";
    insulin?: number;
    carbs?: number;
    bolusType?: string;
  }> = [];

  let totalInsulin = 0;
  let totalCarbs = 0;

  // Process boluses
  for (const b of boluses as BolusRecord[]) {
    treatments.push({
      timestamp: b.timestamp,
      type: "bolus",
      insulin: b.insulinDeliveredUnits,
      carbs: b.carbsInputGrams > 0 ? b.carbsInputGrams : undefined,
      bolusType: b.bolusType,
    });
    totalInsulin += b.insulinDeliveredUnits;
    totalCarbs += b.carbsInputGrams;
  }

  // Process standalone carbs
  for (const c of carbs as CarbsRecord[]) {
    treatments.push({
      timestamp: c.timestamp,
      type: "carbs",
      carbs: c.carbsGrams,
    });
    totalCarbs += c.carbsGrams;
  }

  // Process manual insulin
  for (const m of manualInsulin as ManualInsulinRecord[]) {
    treatments.push({
      timestamp: m.timestamp,
      type: "manual_insulin",
      insulin: m.units,
    });
    totalInsulin += m.units;
  }

  // Sort by timestamp descending
  treatments.sort((a, b) => b.timestamp - a.timestamp);

  return { treatments, totalInsulin, totalCarbs, count: treatments.length };
}

/**
 * Get daily insulin totals for a number of days
 */
async function getDailyInsulinTotals(days: number): Promise<{
  dailyTotals: Record<string, number>;
  average: number;
  min: number;
  max: number;
  daysWithData: number;
}> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const dailyTotals = await queryDailyInsulinByDateRange(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    startDate,
    endDate
  );

  const values = Object.values(dailyTotals);
  const daysWithData = values.length;

  if (daysWithData === 0) {
    return { dailyTotals, average: 0, min: 0, max: 0, daysWithData: 0 };
  }

  return {
    dailyTotals,
    average: values.reduce((a, b) => a + b, 0) / daysWithData,
    min: Math.min(...values),
    max: Math.max(...values),
    daysWithData,
  };
}

/**
 * Get meal boluses for a date range
 */
async function getMealBoluses(
  startDate: string,
  endDate: string
): Promise<{
  boluses: Array<{
    timestamp: number;
    insulin: number;
    carbs: number;
    carbRatio: number;
  }>;
  averageCarbRatio: number;
  count: number;
}> {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime() + 24 * 60 * 60 * 1000;

  const allBoluses = (await queryByTypeAndTimeRange(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    "bolus",
    startTime,
    endTime
  )) as BolusRecord[];

  // Filter to meal boluses (have carbs and insulin)
  const mealBoluses = allBoluses
    .filter((b) => b.carbsInputGrams > 0 && b.insulinDeliveredUnits > 0)
    .map((b) => ({
      timestamp: b.timestamp,
      insulin: b.insulinDeliveredUnits,
      carbs: b.carbsInputGrams,
      carbRatio: b.carbsInputGrams / b.insulinDeliveredUnits,
    }));

  const averageCarbRatio =
    mealBoluses.length > 0
      ? mealBoluses.reduce((sum, b) => sum + b.carbRatio, 0) / mealBoluses.length
      : 0;

  return {
    boluses: mealBoluses,
    averageCarbRatio: Math.round(averageCarbRatio * 10) / 10,
    count: mealBoluses.length,
  };
}

/**
 * Lambda handler for TreatmentDataTools action group
 */
export async function handler(
  event: BedrockAgentEvent
): Promise<BedrockAgentResponse> {
  console.log("TreatmentDataTools invoked:", {
    apiPath: event.apiPath,
    httpMethod: event.httpMethod,
    parameters: event.parameters,
  });

  try {
    switch (event.apiPath) {
      case "/getRecentTreatments": {
        const hours = parseInt(getParam(event, "hours") || "4", 10);
        const result = await getRecentTreatments(Math.min(Math.max(hours, 1), 24));
        return formatResponse(event, result);
      }

      case "/getDailyInsulinTotals": {
        const days = parseInt(getParam(event, "days") || "7", 10);
        const result = await getDailyInsulinTotals(Math.min(Math.max(days, 1), 30));
        return formatResponse(event, result);
      }

      case "/getMealBoluses": {
        const startDate = getParam(event, "startDate") || new Date().toISOString().split("T")[0];
        const endDate = getParam(event, "endDate") || new Date().toISOString().split("T")[0];
        const result = await getMealBoluses(startDate, endDate);
        return formatResponse(event, result);
      }

      default:
        return formatResponse(event, { error: `Unknown API path: ${event.apiPath}` });
    }
  } catch (error) {
    console.error("TreatmentDataTools error:", error);
    return formatResponse(event, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
