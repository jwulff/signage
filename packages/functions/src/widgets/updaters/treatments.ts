/**
 * Treatments Widget Updater
 * Reads treatment data (insulin/carbs) from DynamoDB, populated by the Glooko scraper.
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { queryDailyInsulinByDateRange, formatDateInTimezone, DATA_TIMEZONE } from "@diabetes/core";
import type { WidgetUpdater } from "../types.js";
import type {
  TreatmentDisplayData,
  GlookoTreatment,
  GlookoTreatmentsItem,
} from "../../glooko/types.js";
import { calculateTreatmentTotals } from "../../rendering/treatment-renderer.js";

/** Stale threshold: 6 hours in milliseconds */
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/** Recent window for totals: 4 hours */
const RECENT_WINDOW_HOURS = 4;

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Check if treatment data is stale
 */
function isStale(lastFetchedAt: number): boolean {
  return Date.now() - lastFetchedAt > STALE_THRESHOLD_MS;
}

/**
 * Fetch treatment data from DynamoDB
 */
async function fetchTreatmentData(): Promise<{
  treatments: GlookoTreatment[];
  lastFetchedAt: number;
} | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: Resource.SignageTable.name,
        Key: {
          pk: "GLOOKO#TREATMENTS",
          sk: "DATA",
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    const item = result.Item as GlookoTreatmentsItem;
    return {
      treatments: item.treatments || [],
      lastFetchedAt: item.lastFetchedAt || 0,
    };
  } catch (error) {
    console.error("Error fetching treatment data:", error);
    return null;
  }
}

/** Default user ID for daily insulin queries */
const DEFAULT_USER_ID = "john";

/**
 * Compute a date string N days before a given date string.
 * Uses calendar-day arithmetic to handle DST transitions correctly.
 */
function subtractDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Fetch daily insulin totals from the new schema
 * Returns totals for the last 7 days keyed by date string (YYYY-MM-DD)
 */
async function fetchDailyInsulinTotals(): Promise<Record<string, number>> {
  try {
    // Calculate date range in Pacific timezone (matches stored data)
    // Use calendar-day arithmetic to handle DST transitions correctly
    const endDate = formatDateInTimezone(Date.now(), DATA_TIMEZONE);
    const startDate = subtractDays(endDate, 6);

    return await queryDailyInsulinByDateRange(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      startDate,
      endDate
    );
  } catch (error) {
    console.error("Error fetching daily insulin totals:", error);
    return {};
  }
}

export const treatmentsUpdater: WidgetUpdater = {
  id: "treatments",
  name: "Treatments Widget",
  // Run every minute to keep display in sync, though data only updates hourly
  schedule: "rate(1 minute)",

  async update(): Promise<TreatmentDisplayData | null> {
    // Fetch treatment data and daily insulin totals in parallel
    const [data, dailyInsulinTotals] = await Promise.all([
      fetchTreatmentData(),
      fetchDailyInsulinTotals(),
    ]);

    if (!data) {
      console.warn("No treatment data available");
      return null;
    }

    const { treatments, lastFetchedAt } = data;
    const totals = calculateTreatmentTotals(treatments, RECENT_WINDOW_HOURS);

    return {
      recentInsulinUnits: totals.insulinUnits,
      recentCarbsGrams: totals.carbGrams,
      treatments,
      lastFetchedAt,
      isStale: isStale(lastFetchedAt),
      dailyInsulinTotals,
    };
  },
};
