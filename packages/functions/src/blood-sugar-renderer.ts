/**
 * Blood Sugar Widget Renderer
 * Displays glucose readings from Dexcom on signage display
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { ScheduledHandler } from "aws-lambda";
import { createSolidFrame, setPixel, encodeFrameToBase64 } from "@signage/core";
import type { RGB, Frame } from "@signage/core";
import { getCharBitmap, CHAR_WIDTH, CHAR_HEIGHT } from "./font";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

// Display constants
const DISPLAY_WIDTH = 64;
const DISPLAY_HEIGHT = 64;

// Colors for different glucose ranges
const COLORS = {
  urgentLow: { r: 255, g: 0, b: 0 } as RGB,      // Red
  low: { r: 255, g: 165, b: 0 } as RGB,          // Orange
  normal: { r: 0, g: 255, b: 0 } as RGB,         // Green
  high: { r: 255, g: 255, b: 0 } as RGB,         // Yellow
  veryHigh: { r: 255, g: 0, b: 0 } as RGB,       // Red
  stale: { r: 128, g: 128, b: 128 } as RGB,      // Gray
  header: { r: 0, g: 200, b: 255 } as RGB,       // Cyan
  dim: { r: 100, g: 100, b: 100 } as RGB,        // Gray
  bg: { r: 0, g: 0, b: 0 } as RGB,               // Black
};

// Dexcom API constants
const DEXCOM_BASE_URL = "https://share2.dexcom.com/ShareWebServices/Services";
const DEXCOM_APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";

// Glucose thresholds (mg/dL)
const THRESHOLDS = {
  URGENT_LOW: 55,
  LOW: 70,
  HIGH: 180,
  VERY_HIGH: 250,
} as const;

// Stale threshold: 10 minutes
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

interface DexcomReading {
  WT: string;
  Value: number;
  Trend: string;
}

type RangeStatus = "urgentLow" | "low" | "normal" | "high" | "veryHigh";

/**
 * Draw text on a frame at specified position
 */
function drawText(
  frame: Frame,
  text: string,
  startX: number,
  startY: number,
  color: RGB
): void {
  let cursorX = startX;

  for (const char of text) {
    const bitmap = getCharBitmap(char);

    for (let row = 0; row < CHAR_HEIGHT; row++) {
      for (let col = 0; col < CHAR_WIDTH; col++) {
        const bit = (bitmap[row] >> (CHAR_WIDTH - 1 - col)) & 1;
        if (bit) {
          const x = cursorX + col;
          const y = startY + row;
          if (x >= 0 && x < DISPLAY_WIDTH && y >= 0 && y < DISPLAY_HEIGHT) {
            setPixel(frame, x, y, color);
          }
        }
      }
    }

    cursorX += CHAR_WIDTH + 1;
  }
}

/**
 * Calculate the pixel width of a text string
 */
function measureText(text: string): number {
  return text.length * (CHAR_WIDTH + 1) - 1;
}

/**
 * Classify glucose value into range categories
 */
function classifyRange(mgdl: number): RangeStatus {
  if (mgdl < THRESHOLDS.URGENT_LOW) return "urgentLow";
  if (mgdl < THRESHOLDS.LOW) return "low";
  if (mgdl <= THRESHOLDS.HIGH) return "normal";
  if (mgdl <= THRESHOLDS.VERY_HIGH) return "high";
  return "veryHigh";
}

/**
 * Get trend arrow character
 */
function getTrendArrow(trend: string): string {
  const arrows: Record<string, string> = {
    doubleup: "^^",
    singleup: "^",
    fortyfiveup: "/",
    flat: "-",
    fortyfivedown: "\\",
    singledown: "v",
    doubledown: "vv",
  };
  return arrows[trend.toLowerCase()] ?? "?";
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
async function fetchGlucoseReadings(sessionId: string): Promise<DexcomReading[]> {
  const response = await fetch(
    `${DEXCOM_BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=30&maxCount=2`,
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
 * Generate a frame displaying blood sugar data
 */
function generateBloodSugarFrame(
  glucose: number,
  trend: string,
  delta: number,
  rangeStatus: RangeStatus,
  stale: boolean
): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, COLORS.bg);

  // Get color based on range (or gray if stale)
  const valueColor = stale ? COLORS.stale : COLORS[rangeStatus];

  // Draw "BG" header centered at top (row 2)
  const headerText = "BG";
  const headerWidth = measureText(headerText);
  const headerX = Math.floor((DISPLAY_WIDTH - headerWidth) / 2);
  drawText(frame, headerText, headerX, 2, COLORS.header);

  // Draw glucose value centered (row 20)
  const glucoseStr = String(glucose);
  const glucoseWidth = measureText(glucoseStr);
  const glucoseX = Math.floor((DISPLAY_WIDTH - glucoseWidth) / 2);
  drawText(frame, glucoseStr, glucoseX, 20, valueColor);

  // Draw trend arrow centered (row 38)
  const trendArrow = getTrendArrow(trend);
  const trendWidth = measureText(trendArrow);
  const trendX = Math.floor((DISPLAY_WIDTH - trendWidth) / 2);
  drawText(frame, trendArrow, trendX, 38, valueColor);

  // Draw delta at bottom (row 52)
  const deltaStr = delta >= 0 ? `+${delta}` : String(delta);
  const deltaWidth = measureText(deltaStr);
  const deltaX = Math.floor((DISPLAY_WIDTH - deltaWidth) / 2);
  drawText(frame, deltaStr, deltaX, 52, COLORS.dim);

  return frame;
}

/**
 * Generate error frame when data fetch fails
 */
function generateErrorFrame(_message: string): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, COLORS.bg);

  // Draw "BG" header
  const headerText = "BG";
  const headerWidth = measureText(headerText);
  const headerX = Math.floor((DISPLAY_WIDTH - headerWidth) / 2);
  drawText(frame, headerText, headerX, 2, COLORS.header);

  // Draw "ERR" in red
  const errText = "ERR";
  const errWidth = measureText(errText);
  const errX = Math.floor((DISPLAY_WIDTH - errWidth) / 2);
  drawText(frame, errText, errX, 26, COLORS.urgentLow);

  return frame;
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
 * Core blood sugar update logic
 */
async function updateBloodSugar(): Promise<{
  success: boolean;
  skipped?: boolean;
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

  let frame: Frame;
  let glucose: number | undefined;

  try {
    // Fetch glucose data from Dexcom
    const sessionId = await getSessionId(
      Resource.DexcomUsername.value,
      Resource.DexcomPassword.value
    );

    const readings = await fetchGlucoseReadings(sessionId);

    if (!readings || readings.length === 0) {
      throw new Error("No glucose readings available");
    }

    const latest = readings[0];
    const previous = readings[1];

    glucose = latest.Value;
    const timestamp = parseDexcomTimestamp(latest.WT);
    const delta = previous ? glucose - previous.Value : 0;
    const rangeStatus = classifyRange(glucose);
    const stale = isStale(timestamp);

    console.log(`Glucose: ${glucose} mg/dL, Trend: ${latest.Trend}, Delta: ${delta}, Stale: ${stale}`);

    frame = generateBloodSugarFrame(glucose, latest.Trend, delta, rangeStatus, stale);
  } catch (error) {
    console.error("Failed to fetch glucose data:", error);
    frame = generateErrorFrame("fetch");
  }

  // Broadcast frame
  const broadcast = await broadcastFrame(
    apiClient,
    connections as Array<{ connectionId: string }>,
    frame
  );

  console.log(`Broadcast complete: ${broadcast.success} sent, ${broadcast.failed} failed`);

  return {
    success: true,
    glucose,
    connections: connections.length,
    broadcast,
  };
}

/**
 * Scheduled handler for cron-triggered updates
 */
export const scheduled: ScheduledHandler = async () => {
  console.log("Blood sugar widget triggered (scheduled)");
  const result = await updateBloodSugar();
  console.log("Blood sugar update result:", JSON.stringify(result));
};
