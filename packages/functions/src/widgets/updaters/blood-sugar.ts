/**
 * Blood Sugar Widget Updater
 * Fetches glucose readings from Dexcom Share API.
 */

import { DexcomClient } from "dexcom-share-api";
import { Resource } from "sst";
import type { WidgetUpdater } from "../types";

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

export const bloodSugarUpdater: WidgetUpdater = {
  id: "bloodsugar",
  name: "Blood Sugar Widget",
  schedule: "rate(1 minute)",

  async update(): Promise<BloodSugarData> {
    const client = new DexcomClient({
      username: Resource.DexcomUsername.value,
      password: Resource.DexcomPassword.value,
      server: "us",
    });

    // Fetch latest 2 readings for delta calculation
    const readings = await client.getEstimatedGlucoseValues({
      maxCount: 2,
      minutes: 30,
    });

    if (!readings || readings.length === 0) {
      throw new Error("No glucose readings available");
    }

    const latest = readings[0];
    const previous = readings[1];

    // Calculate delta (change from previous reading)
    const delta = previous ? latest.mgdl - previous.mgdl : 0;

    return {
      glucose: latest.mgdl,
      glucoseMmol: latest.mmol,
      trend: latest.trend,
      trendArrow: mapTrendArrow(latest.trend),
      delta,
      timestamp: latest.timestamp,
      isStale: isStale(latest.timestamp),
      rangeStatus: classifyRange(latest.mgdl),
    };
  },
};
