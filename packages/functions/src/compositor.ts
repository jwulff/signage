/**
 * Display Compositor
 * Combines multiple widgets into a single 64x64 frame.
 *
 * Layout:
 * - Top half (rows 0-31): Clock
 * - Bottom half (rows 32-63): Blood Sugar
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { ScheduledHandler } from "aws-lambda";
import { encodeFrameToBase64 } from "@signage/core";
import type { Frame } from "@signage/core";
import {
  generateCompositeFrame,
  classifyRange,
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  type BloodSugarDisplayData,
  type ClockWeatherData,
  type ReadinessDisplayData,
} from "./rendering/index.js";
import {
  getOuraUsers,
  getOuraUserProfile,
  getCachedReadiness,
  getCachedSleep,
} from "./oura/client.js";
import {
  getSessionId,
  fetchGlucoseReadings,
  parseDexcomTimestamp,
} from "./dexcom/client.js";
import type { OuraUsersListItem, OuraUserItem, OuraReadinessItem, OuraSleepItem } from "./oura/types.js";
import type { TreatmentDisplayData, GlookoTreatmentsItem } from "./glooko/types.js";
import { calculateTreatmentTotals } from "./rendering/treatment-renderer.js";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

// Stale threshold: 10 minutes
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Check if timestamp is stale (>10 minutes old)
 */
function isStale(timestamp: number): boolean {
  return Date.now() - timestamp >= STALE_THRESHOLD_MS;
}

/**
 * Chart point for history
 */
interface ChartPoint {
  timestamp: number;
  glucose: number;
}

/**
 * Fetch blood sugar data and history from Dexcom
 */
async function fetchBloodSugarData(): Promise<{
  current: BloodSugarDisplayData | null;
  history: ChartPoint[];
}> {
  try {
    const sessionId = await getSessionId({
      username: Resource.DexcomUsername.value,
      password: Resource.DexcomPassword.value,
    });

    // Fetch current reading (last 30 min, 2 values for delta)
    const readings = await fetchGlucoseReadings(sessionId, 30, 2);

    // Fetch history (24 hours for split chart: 21h compressed + 3h detailed)
    const historyReadings = await fetchGlucoseReadings(sessionId, 1440, 300);

    let current: BloodSugarDisplayData | null = null;

    if (readings && readings.length > 0) {
      const latest = readings[0];
      const previous = readings[1];

      const glucose = latest.Value;
      const timestamp = parseDexcomTimestamp(latest.WT);
      const delta = previous ? glucose - previous.Value : 0;

      current = {
        glucose,
        trend: latest.Trend,
        delta,
        timestamp,
        rangeStatus: classifyRange(glucose),
        isStale: isStale(timestamp),
      };
    }

    // Convert history readings to chart points
    const history: ChartPoint[] = historyReadings
      .map((r) => ({
        timestamp: parseDexcomTimestamp(r.WT),
        glucose: r.Value,
      }))
      .filter((p) => p.timestamp > 0)
      .reverse(); // Oldest first

    return { current, history };
  } catch (error) {
    console.error("Failed to fetch blood sugar data:", error);
    return { current: null, history: [] };
  }
}

// Seattle coordinates (Fremont area)
const SEATTLE_LAT = 47.6681435;
const SEATTLE_LON = -122.3609856;

// Weather cache TTL: 30 minutes
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Get cached weather data from DynamoDB
 */
async function getCachedWeather(): Promise<ClockWeatherData | null> {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: Resource.SignageTable.name,
        Key: { pk: "WEATHER_CACHE", sk: "LATEST" },
      })
    );

    if (result.Item) {
      const age = Date.now() - (result.Item.timestamp as number);

      if (age < WEATHER_CACHE_TTL_MS) {
        console.log(`Using cached weather data (${Math.round(age / 1000)}s old)`);
        return result.Item.data as ClockWeatherData;
      }
    }
  } catch (error) {
    console.error("Failed to get cached weather:", error);
  }
  return null;
}

/**
 * Save weather data to DynamoDB cache
 */
async function cacheWeather(data: ClockWeatherData): Promise<void> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: Resource.SignageTable.name,
        Item: {
          pk: "WEATHER_CACHE",
          sk: "LATEST",
          data,
          timestamp: Date.now(),
        },
      })
    );
  } catch (error) {
    console.error("Failed to cache weather:", error);
  }
}

/**
 * Fetch weather data from Open-Meteo API (free, no API key needed)
 * Returns temperatures, cloud cover, and precipitation for display
 * Uses DynamoDB cache to handle API flakiness
 */
async function fetchWeatherData(): Promise<ClockWeatherData | null> {
  // Try cache first
  const cached = await getCachedWeather();
  if (cached) {
    return cached;
  }

  try {
    // Get 2 days of forecast data including conditions
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${SEATTLE_LAT}&longitude=${SEATTLE_LON}&hourly=temperature_2m,cloudcover,precipitation,snowfall&temperature_unit=fahrenheit&forecast_days=2&timezone=America/Los_Angeles`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API failed: ${response.status}`);
    }

    interface OpenMeteoResponse {
      hourly: {
        time: string[];
        temperature_2m: number[];
        cloudcover: number[];
        precipitation: number[];
        snowfall: number[];
      };
    }

    const data = (await response.json()) as OpenMeteoResponse;

    if (!data.hourly?.time || !data.hourly?.temperature_2m) {
      console.warn("Invalid weather data received");
      return null;
    }

    const temps = data.hourly.temperature_2m;
    const clouds = data.hourly.cloudcover || [];
    const precip = data.hourly.precipitation || [];
    const snow = data.hourly.snowfall || [];

    // Get current Pacific hour (0-23) - API data starts at midnight today
    const now = new Date();
    const pacificHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "2-digit",
        hour12: false,
      }).format(now)
    );

    // The API returns 48 hours starting from midnight today
    const nowIndex = pacificHour;

    console.log(`Weather: Pacific hour=${pacificHour}, data length=${temps.length}`);

    // Get temperatures at offsets, with bounds checking
    const getTemp = (offset: number): number | undefined => {
      const idx = nowIndex + offset;
      return idx >= 0 && idx < temps.length ? temps[idx] : undefined;
    };

    // Build hourly conditions array
    const hourlyConditions = temps.map((temp, i) => ({
      temp,
      cloudCover: clouds[i],
      precipitation: precip[i] || 0,
      isSnow: (snow[i] || 0) > 0,
    }));

    const result: ClockWeatherData = {
      tempMinus12h: getTemp(-12),
      tempMinus6h: getTemp(-6),
      tempNow: getTemp(0),
      tempPlus6h: getTemp(6),
      tempPlus12h: getTemp(12),
      hourlyConditions,
      currentHourIndex: nowIndex,
    };

    console.log(`Weather: now=${result.tempNow}°F, clouds=${clouds[nowIndex]}%, precip=${precip[nowIndex]}mm`);

    // Cache the result
    await cacheWeather(result);

    return result;
  } catch (error) {
    console.error("Failed to fetch weather data:", error);
    return null;
  }
}

// Stale readiness threshold: 24 hours
const READINESS_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch readiness and sleep data for all linked Oura users
 */
async function fetchReadinessData(): Promise<ReadinessDisplayData[]> {
  const userIds = await getOuraUsers();
  if (userIds.length === 0) {
    return [];
  }

  // Get today's date in Pacific timezone
  const now = new Date();
  const pacificDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const today = pacificDate.toISOString().split("T")[0];

  const results: ReadinessDisplayData[] = [];

  // Limit to first 2 users for display
  for (const userId of userIds.slice(0, 2)) {
    const profile = await getOuraUserProfile(userId);
    if (!profile) {
      continue;
    }

    // Fetch both readiness and sleep in parallel
    const [readiness, sleep] = await Promise.all([
      getCachedReadiness(userId, today),
      getCachedSleep(userId, today),
    ]);

    // Data is stale if both are missing or if the most recent one is stale
    const readinessStale = readiness ? (Date.now() - readiness.fetchedAt > READINESS_STALE_THRESHOLD_MS) : true;
    const sleepStale = sleep ? (Date.now() - sleep.fetchedAt > READINESS_STALE_THRESHOLD_MS) : true;
    const isStale = readinessStale && sleepStale;

    const displayData: ReadinessDisplayData = {
      initial: profile.initial || profile.displayName?.charAt(0).toUpperCase() || "?",
      score: readiness?.score ?? null,
      sleepScore: sleep?.score ?? null,
      isStale,
      needsReauth: profile.needsReauth ?? false,
    };

    results.push(displayData);
  }

  return results;
}

// Treatment stale threshold: 6 hours
const TREATMENT_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * Fetch treatment data from DynamoDB (populated by Glooko scraper)
 */
async function fetchTreatmentData(): Promise<TreatmentDisplayData | null> {
  try {
    const result = await ddb.send(
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
    const treatments = item.treatments || [];
    const lastFetchedAt = item.lastFetchedAt || 0;
    const isStale = Date.now() - lastFetchedAt > TREATMENT_STALE_THRESHOLD_MS;

    // Calculate totals for last 4 hours
    const totals = calculateTreatmentTotals(treatments, 4);

    return {
      recentInsulinUnits: totals.insulinUnits,
      recentCarbsGrams: totals.carbGrams,
      treatments,
      lastFetchedAt,
      isStale,
    };
  } catch (error) {
    console.error("Failed to fetch treatment data:", error);
    return null;
  }
}

/**
 * Get active WebSocket connections
 * Uses Query on pk="CONNECTIONS" for efficient retrieval
 */
async function getActiveConnections() {
  const allItems: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: Resource.SignageTable.name,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "CONNECTIONS" },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      allItems.push(...result.Items);
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
}

/**
 * Broadcast a frame to all connections
 */
async function broadcastFrame(
  apiClient: ApiGatewayManagementApiClient,
  connections: Array<{ connectionId: string }>,
  frame: Frame
): Promise<{ success: number; failed: number }> {
  const frameData = encodeFrameToBase64(frame);
  const message = JSON.stringify({
    type: "frame",
    payload: {
      frame: {
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        data: frameData,
      },
    },
    timestamp: Date.now(),
  });

  let success = 0;
  let failed = 0;

  await Promise.all(
    connections.map(async (conn) => {
      try {
        await apiClient.send(
          new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: message,
          })
        );
        success++;
      } catch {
        failed++;
      }
    })
  );

  return { success, failed };
}

/**
 * Main compositor update logic
 */
async function updateDisplay(): Promise<{
  success: boolean;
  skipped?: boolean;
  time?: string;
  glucose?: number;
  connections?: number;
  broadcast?: { success: number; failed: number };
  error?: string;
}> {
  // Check for active connections first
  const connections = await getActiveConnections();

  if (connections.length === 0) {
    console.log("No active connections, skipping frame broadcast");
    return { success: true, skipped: true };
  }

  console.log(`Found ${connections.length} active connections`);

  // Get WebSocket endpoint
  const wsApiUrl = Resource.SignageApi.url;
  if (!wsApiUrl) {
    return { success: false, error: "WebSocket URL not configured" };
  }
  const url = new URL(wsApiUrl);
  const endpoint = `https://${url.host}/${url.pathname.split("/")[1] || ""}`;

  const apiClient = new ApiGatewayManagementApiClient({ endpoint });

  // Fetch blood sugar, weather, readiness, and treatment data in parallel
  const [bloodSugarResult, weatherData, readinessData, treatmentData] = await Promise.all([
    fetchBloodSugarData(),
    fetchWeatherData(),
    fetchReadinessData(),
    fetchTreatmentData(),
  ]);

  const { current: bloodSugarData, history } = bloodSugarResult;

  if (bloodSugarData) {
    console.log(`Blood sugar: ${bloodSugarData.glucose} mg/dL, Trend: ${bloodSugarData.trend}, History: ${history.length} points`);
  } else {
    console.log("Blood sugar data unavailable");
  }

  if (weatherData) {
    console.log(`Weather: ${weatherData.tempNow}°F now, ${weatherData.tempMinus12h}°F 12h ago, ${weatherData.tempPlus12h}°F in 12h`);
  } else {
    console.log("Weather data unavailable");
  }

  if (readinessData.length > 0) {
    const ouraStr = readinessData.map(r => `${r.initial}:${r.score ?? '--'}/${r.sleepScore ?? '--'}`).join(', ');
    console.log(`Oura (readiness/sleep): ${ouraStr}`);
  } else {
    console.log("No Oura data (no linked users)");
  }

  if (treatmentData && !treatmentData.isStale) {
    console.log(`Treatments (4h): ${treatmentData.recentInsulinUnits}u insulin, ${treatmentData.recentCarbsGrams}g carbs, ${treatmentData.treatments.length} events`);
  } else if (treatmentData?.isStale) {
    console.log("Treatment data is stale (>6h old)");
  } else {
    console.log("No treatment data available");
  }

  // Generate composite frame using shared rendering module
  const frame = generateCompositeFrame({
    bloodSugar: bloodSugarData,
    bloodSugarHistory: history.length > 0 ? { points: history } : undefined,
    timezone: "America/Los_Angeles",
    weather: weatherData ?? undefined,
    readiness: readinessData.length > 0 ? readinessData : undefined,
    treatments: treatmentData,
  });

  // Get current time in Pacific for logging
  const now = new Date();
  const pacificTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  let hours = pacificTime.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = String(pacificTime.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes} ${ampm}`;

  // Broadcast frame
  const broadcast = await broadcastFrame(
    apiClient,
    connections as Array<{ connectionId: string }>,
    frame
  );

  console.log(`Broadcast complete: ${broadcast.success} sent, ${broadcast.failed} failed`);

  // Cache frame for new connections
  const frameData = encodeFrameToBase64(frame);
  await ddb.send(
    new PutCommand({
      TableName: Resource.SignageTable.name,
      Item: {
        pk: "FRAME_CACHE",
        sk: "LATEST",
        frameData,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        timestamp: Date.now(),
      },
    })
  );

  return {
    success: true,
    time: timeStr,
    glucose: bloodSugarData?.glucose,
    connections: connections.length,
    broadcast,
  };
}

/**
 * Scheduled handler for cron-triggered updates
 */
export const scheduled: ScheduledHandler = async () => {
  console.log("Compositor triggered");
  const result = await updateDisplay();
  console.log("Compositor result:", JSON.stringify(result));
};
