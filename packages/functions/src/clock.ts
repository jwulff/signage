/**
 * Clock Widget
 * Displays current time in 12-hour format on signage display
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2, ScheduledHandler } from "aws-lambda";
import { createSolidFrame, setPixel, encodeFrameToBase64 } from "@signage/core";
import type { RGB, Frame } from "@signage/core";
import { getCharBitmap, CHAR_WIDTH, CHAR_HEIGHT } from "./font";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

// Display constants
const DISPLAY_WIDTH = 64;
const DISPLAY_HEIGHT = 64;

// Colors
const HEADER_COLOR: RGB = { r: 0, g: 200, b: 255 }; // Cyan
const TEXT_COLOR: RGB = { r: 255, g: 255, b: 255 }; // White
const DIM_COLOR: RGB = { r: 100, g: 100, b: 100 }; // Gray
const BG_COLOR: RGB = { r: 0, g: 0, b: 0 }; // Black

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
 * Generate a frame displaying the current time
 */
function generateClockFrame(timeStr: string, ampm: string): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, BG_COLOR);

  // Draw "CLOCK" header centered at top (row 2)
  const headerText = "CLOCK";
  const headerWidth = measureText(headerText);
  const headerX = Math.floor((DISPLAY_WIDTH - headerWidth) / 2);
  drawText(frame, headerText, headerX, 2, HEADER_COLOR);

  // Draw time centered in middle (row 26)
  const timeWidth = measureText(timeStr);
  const timeX = Math.floor((DISPLAY_WIDTH - timeWidth) / 2);
  drawText(frame, timeStr, timeX, 26, TEXT_COLOR);

  // Draw AM/PM indicator centered at bottom (row 50)
  const ampmWidth = measureText(ampm);
  const ampmX = Math.floor((DISPLAY_WIDTH - ampmWidth) / 2);
  drawText(frame, ampm, ampmX, 50, DIM_COLOR);

  return frame;
}

/**
 * Get active WebSocket connections from DynamoDB
 */
async function getActiveConnections() {
  const allItems: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: Resource.SignageTable.name,
        FilterExpression: "begins_with(pk, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": "CONNECTION#",
        },
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
 * Core clock update logic - shared between HTTP and scheduled handlers
 */
async function updateClock(): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
  time?: string;
  connections?: number;
  broadcast?: { success: number; failed: number };
  error?: string;
}> {
  // Check for active connections first
  const connections = await getActiveConnections();

  if (connections.length === 0) {
    console.log("No active connections, skipping frame broadcast");
    return { success: true, skipped: true, reason: "No active connections" };
  }

  console.log(`Found ${connections.length} active connections`);

  // Get WebSocket endpoint from env var
  const wsApiUrl = process.env.WEBSOCKET_URL;
  if (!wsApiUrl) {
    return { success: false, error: "WEBSOCKET_URL not configured" };
  }
  const url = new URL(wsApiUrl);
  const endpoint = `https://${url.host}/${url.pathname.split("/")[1] || ""}`;

  const apiClient = new ApiGatewayManagementApiClient({ endpoint });

  // Get current time in 12-hour format
  const now = new Date();
  let hours = now.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12; // Convert 0 to 12
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  console.log(`Current time: ${timeStr} ${ampm}`);

  // Generate and broadcast frame
  const frame = generateClockFrame(timeStr, ampm);
  const broadcast = await broadcastFrame(
    apiClient,
    connections as Array<{ connectionId: string }>,
    frame
  );

  return {
    success: true,
    time: `${timeStr} ${ampm}`,
    connections: connections.length,
    broadcast,
  };
}

/**
 * HTTP handler for manual testing via /clock endpoint
 */
export const handler: APIGatewayProxyHandlerV2 = async () => {
  console.log("Clock widget requested (HTTP)");
  const result = await updateClock();

  const statusCode = result.error ? 500 : 200;
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(result),
  };
};

/**
 * Scheduled handler for cron-triggered updates
 */
export const scheduled: ScheduledHandler = async () => {
  console.log("Clock widget triggered (scheduled)");
  const result = await updateClock();
  console.log("Clock update result:", JSON.stringify(result));
};
