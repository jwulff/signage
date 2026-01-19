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
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
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
} from "./rendering/index.js";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

// Dexcom API constants
const DEXCOM_BASE_URL = "https://share2.dexcom.com/ShareWebServices/Services";
const DEXCOM_APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";

// Stale threshold: 10 minutes
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

interface DexcomReading {
  WT: string;
  Value: number;
  Trend: string;
}

/**
 * Parse Dexcom timestamp format "Date(1234567890000)" to milliseconds
 */
function parseDexcomTimestamp(wt: string): number {
  const match = wt.match(/Date\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Check if timestamp is stale (>10 minutes old)
 */
function isStale(timestamp: number): boolean {
  return Date.now() - timestamp >= STALE_THRESHOLD_MS;
}

/**
 * Authenticate with Dexcom and get session ID
 */
async function getSessionId(username: string, password: string): Promise<string> {
  const authResponse = await fetch(
    `${DEXCOM_BASE_URL}/General/AuthenticatePublisherAccount`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        accountName: username,
        password: password,
        applicationId: DEXCOM_APP_ID,
      }),
    }
  );

  if (!authResponse.ok) {
    throw new Error(`Dexcom auth failed: ${authResponse.status}`);
  }

  const accountId = await authResponse.json() as string;

  const sessionResponse = await fetch(
    `${DEXCOM_BASE_URL}/General/LoginPublisherAccountById`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        accountId,
        password,
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
 * Fetch glucose readings from Dexcom
 */
async function fetchGlucoseReadings(sessionId: string, minutes = 30, maxCount = 2): Promise<DexcomReading[]> {
  const response = await fetch(
    `${DEXCOM_BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=${minutes}&maxCount=${maxCount}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    }
  );

  if (!response.ok) {
    throw new Error(`Dexcom fetch failed: ${response.status}`);
  }

  return response.json() as Promise<DexcomReading[]>;
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
    const sessionId = await getSessionId(
      Resource.DexcomUsername.value,
      Resource.DexcomPassword.value
    );

    // Fetch current reading (last 30 min, 2 values for delta)
    const readings = await fetchGlucoseReadings(sessionId, 30, 2);

    // Fetch history (3 hours, ~36 readings)
    const historyReadings = await fetchGlucoseReadings(sessionId, 180, 50);

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

/**
 * Get active WebSocket connections
 */
async function getActiveConnections() {
  const allItems: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: Resource.SignageTable.name,
        FilterExpression: "begins_with(pk, :prefix)",
        ExpressionAttributeValues: { ":prefix": "CONNECTION#" },
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

  // Fetch blood sugar data and history (clock uses current time, no fetch needed)
  const { current: bloodSugarData, history } = await fetchBloodSugarData();

  if (bloodSugarData) {
    console.log(`Blood sugar: ${bloodSugarData.glucose} mg/dL, Trend: ${bloodSugarData.trend}, History: ${history.length} points`);
  } else {
    console.log("Blood sugar data unavailable");
  }

  // Generate composite frame using shared rendering module
  const frame = generateCompositeFrame({
    bloodSugar: bloodSugarData,
    bloodSugarHistory: history.length > 0 ? { points: history } : undefined,
    timezone: "America/Los_Angeles",
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
