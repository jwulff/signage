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
import { createSolidFrame, setPixel, encodeFrameToBase64 } from "@signage/core";
import type { RGB, Frame } from "@signage/core";
import { getCharBitmap, CHAR_WIDTH, CHAR_HEIGHT } from "./font";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

// Display constants
const DISPLAY_WIDTH = 64;
const DISPLAY_HEIGHT = 64;

// Region boundaries
const CLOCK_REGION_START = 0;
const CLOCK_REGION_END = 31;
const BG_REGION_START = 32;
const BG_REGION_END = 63;

// Colors
const COLORS = {
  // Clock colors
  clockHeader: { r: 0, g: 200, b: 255 } as RGB,   // Cyan
  clockTime: { r: 255, g: 255, b: 255 } as RGB,   // White
  clockAmPm: { r: 100, g: 100, b: 100 } as RGB,   // Gray

  // Blood sugar colors
  bgHeader: { r: 0, g: 200, b: 255 } as RGB,      // Cyan
  urgentLow: { r: 255, g: 0, b: 0 } as RGB,       // Red
  low: { r: 255, g: 165, b: 0 } as RGB,           // Orange
  normal: { r: 0, g: 255, b: 0 } as RGB,          // Green
  high: { r: 255, g: 255, b: 0 } as RGB,          // Yellow
  veryHigh: { r: 255, g: 0, b: 0 } as RGB,        // Red
  stale: { r: 128, g: 128, b: 128 } as RGB,       // Gray
  delta: { r: 100, g: 100, b: 100 } as RGB,       // Gray

  // Background
  bg: { r: 0, g: 0, b: 0 } as RGB,
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

interface BloodSugarData {
  glucose: number;
  trend: string;
  delta: number;
  rangeStatus: RangeStatus;
  isStale: boolean;
}

/**
 * Draw text on a frame at specified position, respecting vertical bounds
 */
function drawText(
  frame: Frame,
  text: string,
  startX: number,
  startY: number,
  color: RGB,
  minY: number = 0,
  maxY: number = DISPLAY_HEIGHT - 1
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
          if (x >= 0 && x < DISPLAY_WIDTH && y >= minY && y <= maxY) {
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
 * Center text horizontally
 */
function centerX(text: string): number {
  return Math.floor((DISPLAY_WIDTH - measureText(text)) / 2);
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
 * Fetch blood sugar data from Dexcom
 */
async function fetchBloodSugarData(): Promise<BloodSugarData | null> {
  try {
    const sessionId = await getSessionId(
      Resource.DexcomUsername.value,
      Resource.DexcomPassword.value
    );

    const readings = await fetchGlucoseReadings(sessionId);

    if (!readings || readings.length === 0) {
      return null;
    }

    const latest = readings[0];
    const previous = readings[1];

    const glucose = latest.Value;
    const timestamp = parseDexcomTimestamp(latest.WT);
    const delta = previous ? glucose - previous.Value : 0;

    return {
      glucose,
      trend: latest.Trend,
      delta,
      rangeStatus: classifyRange(glucose),
      isStale: isStale(timestamp),
    };
  } catch (error) {
    console.error("Failed to fetch blood sugar data:", error);
    return null;
  }
}

/**
 * Render clock widget to top region of frame
 */
function renderClockRegion(frame: Frame): void {
  // Get current time
  const now = new Date();
  let hours = now.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Row 2: Time (larger, centered)
  drawText(frame, timeStr, centerX(timeStr), 4, COLORS.clockTime, CLOCK_REGION_START, CLOCK_REGION_END);

  // Row 18: AM/PM
  drawText(frame, ampm, centerX(ampm), 18, COLORS.clockAmPm, CLOCK_REGION_START, CLOCK_REGION_END);
}

/**
 * Render blood sugar widget to bottom region of frame
 */
function renderBloodSugarRegion(frame: Frame, data: BloodSugarData | null): void {
  if (!data) {
    // Show error state
    const errText = "BG ERR";
    drawText(frame, errText, centerX(errText), 44, COLORS.urgentLow, BG_REGION_START, BG_REGION_END);
    return;
  }

  const { glucose, trend, delta, rangeStatus, isStale: stale } = data;
  const valueColor = stale ? COLORS.stale : COLORS[rangeStatus];

  // Row 34: "BG" header + glucose value on same line
  const glucoseStr = String(glucose);
  const headerAndValue = `BG ${glucoseStr}`;
  drawText(frame, headerAndValue, centerX(headerAndValue), 36, valueColor, BG_REGION_START, BG_REGION_END);

  // Row 50: Trend arrow + delta
  const trendArrow = getTrendArrow(trend);
  const deltaStr = delta >= 0 ? `+${delta}` : String(delta);
  const trendAndDelta = `${trendArrow} ${deltaStr}`;
  drawText(frame, trendAndDelta, centerX(trendAndDelta), 50, COLORS.delta, BG_REGION_START, BG_REGION_END);
}

/**
 * Draw a horizontal separator line
 */
function drawSeparator(frame: Frame, y: number, color: RGB): void {
  for (let x = 4; x < DISPLAY_WIDTH - 4; x++) {
    setPixel(frame, x, y, color);
  }
}

/**
 * Generate the composite frame with all widgets
 */
function generateCompositeFrame(bloodSugarData: BloodSugarData | null): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, COLORS.bg);

  // Render clock in top region
  renderClockRegion(frame);

  // Draw separator line
  drawSeparator(frame, 32, { r: 40, g: 40, b: 40 });

  // Render blood sugar in bottom region
  renderBloodSugarRegion(frame, bloodSugarData);

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

  // Fetch blood sugar data (clock uses current time, no fetch needed)
  const bloodSugarData = await fetchBloodSugarData();

  if (bloodSugarData) {
    console.log(`Blood sugar: ${bloodSugarData.glucose} mg/dL, Trend: ${bloodSugarData.trend}`);
  } else {
    console.log("Blood sugar data unavailable");
  }

  // Generate composite frame
  const frame = generateCompositeFrame(bloodSugarData);

  // Get current time for logging
  const now = new Date();
  let hours = now.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
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
