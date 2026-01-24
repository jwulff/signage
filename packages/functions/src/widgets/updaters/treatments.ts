/**
 * Treatments Widget Updater
 * Reads treatment data (insulin/carbs) from DynamoDB, populated by the Glooko scraper.
 */

import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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

export const treatmentsUpdater: WidgetUpdater = {
  id: "treatments",
  name: "Treatments Widget",
  // Run every minute to keep display in sync, though data only updates hourly
  schedule: "rate(1 minute)",

  async update(): Promise<TreatmentDisplayData | null> {
    const data = await fetchTreatmentData();

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
    };
  },
};
