/**
 * Blood Sugar Widget Updater
 * Fetches glucose readings from Dexcom Share API.
 *
 * Also writes CGM records to the diabetes data store for agent analysis.
 */

import { Resource } from "sst";
import type {
  WidgetUpdaterWithHistory,
  WidgetHistoryConfig,
  TimeSeriesPoint,
} from "../types";
import {
  getSessionId,
  fetchGlucoseReadings,
  parseDexcomTimestamp,
  type DexcomReading,
} from "../../dexcom/client.js";
import { storeRecords, createDocClient } from "@diabetes/core";
import type { CgmReading } from "@diabetes/core";

export interface BloodSugarData {
  /** Glucose value in mg/dL */
  glucose: number;
  /** Glucose value in mmol/L */
  glucoseMmol: number;
  /** Raw trend string from Dexcom (e.g., "Flat", "SingleUp") */
  trend: string;
  /** Display arrow character (→, ↗, ↑, ↘, ↓, etc.) */
  trendArrow: string;
  /** Change from previous reading in mg/dL */
  delta: number;
  /** Unix timestamp of reading in milliseconds */
  timestamp: number;
  /** True if data is >10 minutes old */
  isStale: boolean;
  /** Range classification for display coloring */
  rangeStatus: "urgentLow" | "low" | "normal" | "high" | "veryHigh";
}

/** Stale threshold: 10 minutes in milliseconds */
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

/** Glucose thresholds (mg/dL) */
const THRESHOLDS = {
  URGENT_LOW: 55,
  LOW: 70,
  HIGH: 180,
  VERY_HIGH: 250,
} as const;

/** Trend arrow mappings */
const TREND_ARROWS: Record<string, string> = {
  doubleup: "↑↑",
  singleup: "↑",
  fortyfiveup: "↗",
  flat: "→",
  fortyfivedown: "↘",
  singledown: "↓",
  doubledown: "↓↓",
};

/**
 * Classify glucose value into range categories.
 */
export function classifyRange(
  mgdl: number
): BloodSugarData["rangeStatus"] {
  if (mgdl < THRESHOLDS.URGENT_LOW) return "urgentLow";
  if (mgdl < THRESHOLDS.LOW) return "low";
  if (mgdl <= THRESHOLDS.HIGH) return "normal";
  if (mgdl <= THRESHOLDS.VERY_HIGH) return "high";
  return "veryHigh";
}

/**
 * Map Dexcom trend string to display arrow.
 */
export function mapTrendArrow(trend: string): string {
  return TREND_ARROWS[trend.toLowerCase()] ?? "?";
}

/**
 * Check if a reading timestamp is stale (>10 minutes old).
 */
export function isStale(timestamp: number, now: number = Date.now()): boolean {
  return now - timestamp >= STALE_THRESHOLD_MS;
}

/**
 * Convert mg/dL to mmol/L.
 */
function mgdlToMmol(mgdl: number): number {
  return Math.round((mgdl / 18.0182) * 10) / 10;
}

/** Blood sugar history configuration */
const HISTORY_CONFIG: WidgetHistoryConfig = {
  enabled: true,
  retentionHours: 24,
  backfillDepthHours: 24,
  backfillThresholdMinutes: 15,
  dedupeWindowMinutes: 5,
  storageType: "time-series",
};

/**
 * Convert a Dexcom reading to a time-series point for storage.
 */
function readingToTimeSeriesPoint(
  reading: DexcomReading,
  prevReading?: DexcomReading
): TimeSeriesPoint<Pick<BloodSugarData, "glucose" | "glucoseMmol" | "rangeStatus">> {
  const mgdl = reading.Value;
  const timestamp = parseDexcomTimestamp(reading.WT);
  const delta = prevReading ? mgdl - prevReading.Value : 0;

  return {
    timestamp,
    value: {
      glucose: mgdl,
      glucoseMmol: mgdlToMmol(mgdl),
      rangeStatus: classifyRange(mgdl),
    },
    meta: {
      trend: reading.Trend,
      trendArrow: mapTrendArrow(reading.Trend),
      delta,
    },
  };
}

/**
 * Convert a Dexcom reading to a CGM record for agent analysis.
 */
function dexcomToCgmRecord(reading: DexcomReading): CgmReading {
  return {
    type: "cgm",
    timestamp: parseDexcomTimestamp(reading.WT),
    glucoseMgDl: reading.Value,
    importedAt: Date.now(),
    sourceFile: "dexcom-share-api",
  };
}

/** Default user ID for single-user system */
const DIABETES_USER_ID = "john";

/**
 * Store CGM readings for agent analysis (dual-write).
 * This writes readings to the same DynamoDB table but with different keys
 * that the Bedrock agent queries for analysis.
 */
async function storeCgmReadingsForAgent(readings: DexcomReading[]): Promise<void> {
  if (readings.length === 0) return;

  try {
    const docClient = createDocClient();
    const tableName = Resource.SignageTable.name;
    const cgmRecords = readings.map(dexcomToCgmRecord);

    const result = await storeRecords(
      docClient,
      tableName,
      DIABETES_USER_ID,
      cgmRecords
    );

    if (result.written > 0) {
      console.log(`CGM dual-write: ${result.written} new, ${result.duplicates} duplicates`);
    }

    if (result.errors.length > 0) {
      console.error(`CGM dual-write errors: ${result.errors.join(", ")}`);
    }
  } catch (error) {
    // Log but don't fail the widget update - display data is more important
    console.error("CGM dual-write failed:", error instanceof Error ? error.message : String(error));
  }
}

export const bloodSugarUpdater: WidgetUpdaterWithHistory = {
  id: "bloodsugar",
  name: "Blood Sugar Widget",
  schedule: "rate(1 minute)",

  historyConfig: HISTORY_CONFIG,

  async update(): Promise<BloodSugarData> {
    const sessionId = await getSessionId({
      username: Resource.DexcomUsername.value,
      password: Resource.DexcomPassword.value,
    });

    // Fetch latest 2 readings for delta calculation
    const readings = await fetchGlucoseReadings(sessionId, 30, 2);

    if (!readings || readings.length === 0) {
      throw new Error("No glucose readings available");
    }

    // Dual-write: store readings for agent analysis (fire-and-forget)
    // This ensures the Bedrock agent has real-time CGM data
    void storeCgmReadingsForAgent(readings);

    const latest = readings[0];
    const previous = readings[1];

    const latestMgdl = latest.Value;
    const latestTimestamp = parseDexcomTimestamp(latest.WT);

    // Calculate delta (change from previous reading)
    const delta = previous ? latestMgdl - previous.Value : 0;

    return {
      glucose: latestMgdl,
      glucoseMmol: mgdlToMmol(latestMgdl),
      trend: latest.Trend,
      trendArrow: mapTrendArrow(latest.Trend),
      delta,
      timestamp: latestTimestamp,
      isStale: isStale(latestTimestamp),
      rangeStatus: classifyRange(latestMgdl),
    };
  },

  async fetchHistory(since: number, until: number): Promise<TimeSeriesPoint[]> {
    const sessionId = await getSessionId({
      username: Resource.DexcomUsername.value,
      password: Resource.DexcomPassword.value,
    });

    // Calculate minutes from since to until
    const minutes = Math.ceil((until - since) / 60000);
    // Dexcom supports up to 1440 minutes (24h)
    const clampedMinutes = Math.min(minutes, 1440);

    // Blood sugar readings are every 5 minutes, so max ~288 per 24h
    const maxCount = Math.ceil(clampedMinutes / 5) + 10; // +10 for safety margin

    console.log(
      `Fetching blood sugar history: ${clampedMinutes} minutes, maxCount=${maxCount}`
    );

    const readings = await fetchGlucoseReadings(sessionId, clampedMinutes, maxCount);

    if (!readings || readings.length === 0) {
      return [];
    }

    // Dual-write: store all historical readings for agent analysis
    void storeCgmReadingsForAgent(readings);

    // Convert to time-series points, filtering to requested range
    // Readings come newest-first, reverse for chronological order
    const chronological = [...readings].reverse();

    return chronological
      .map((reading, idx) =>
        readingToTimeSeriesPoint(reading, chronological[idx - 1])
      )
      .filter((point) => point.timestamp >= since && point.timestamp <= until);
  },
};
