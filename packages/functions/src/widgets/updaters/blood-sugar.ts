/**
 * Blood Sugar Widget Updater
 * Fetches glucose readings from Dexcom Share API.
 */

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

/** Dexcom Share API endpoints (US region) */
const DEXCOM_BASE_URL = "https://share2.dexcom.com/ShareWebServices/Services";
const DEXCOM_APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";

/** Dexcom API response types */
interface DexcomReading {
  WT: string; // Timestamp like "Date(1234567890000)"
  ST: string; // System time
  DT: string; // Display time
  Value: number; // Glucose in mg/dL
  Trend: string; // Trend direction
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
 * Authenticate with Dexcom Share and get a session ID.
 */
async function getSessionId(username: string, password: string): Promise<string> {
  console.log(`Authenticating with username: ${username.slice(0, 3)}***, password starts with: ${password.slice(0, 2)}*** (len=${password.length})`);

  // Step 1: Get account ID
  const authResponse = await fetch(
    `${DEXCOM_BASE_URL}/General/AuthenticatePublisherAccount`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        accountName: username,
        password: password,
        applicationId: DEXCOM_APP_ID,
      }),
    }
  );

  if (!authResponse.ok) {
    const errorText = await authResponse.text();
    console.error(`Dexcom auth error response: ${errorText}`);
    throw new Error(`Dexcom auth failed: ${authResponse.status}`);
  }

  const accountId = await authResponse.json();

  // Step 2: Get session ID
  const sessionResponse = await fetch(
    `${DEXCOM_BASE_URL}/General/LoginPublisherAccountById`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        accountId: accountId,
        password: password,
        applicationId: DEXCOM_APP_ID,
      }),
    }
  );

  if (!sessionResponse.ok) {
    throw new Error(`Dexcom login failed: ${sessionResponse.status}`);
  }

  return sessionResponse.json() as Promise<string>;
}

/**
 * Fetch glucose readings from Dexcom Share.
 */
async function fetchGlucoseReadings(
  sessionId: string,
  maxCount: number = 2,
  minutes: number = 30
): Promise<DexcomReading[]> {
  const response = await fetch(
    `${DEXCOM_BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=${minutes}&maxCount=${maxCount}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Dexcom fetch failed: ${response.status}`);
  }

  return response.json() as Promise<DexcomReading[]>;
}

/**
 * Parse Dexcom timestamp format "Date(1234567890000)" to milliseconds.
 */
function parseDexcomTimestamp(wt: string): number {
  const match = wt.match(/Date\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Convert mg/dL to mmol/L.
 */
function mgdlToMmol(mgdl: number): number {
  return Math.round((mgdl / 18.0182) * 10) / 10;
}

export const bloodSugarUpdater: WidgetUpdater = {
  id: "bloodsugar",
  name: "Blood Sugar Widget",
  schedule: "rate(1 minute)",

  async update(): Promise<BloodSugarData> {
    const sessionId = await getSessionId(
      Resource.DexcomUsername.value,
      Resource.DexcomPassword.value
    );

    // Fetch latest 2 readings for delta calculation
    const readings = await fetchGlucoseReadings(sessionId, 2, 30);

    if (!readings || readings.length === 0) {
      throw new Error("No glucose readings available");
    }

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
};
