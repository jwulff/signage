/**
 * Test bitmap generator
 * Creates a test pattern and broadcasts to all connected terminals
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createSolidFrame, setPixel, encodeFrameToBase64 } from "@signage/core";
import type { RGB, Frame } from "@signage/core";
import { getCharBitmap, CHAR_WIDTH, CHAR_HEIGHT, measureText } from "./font.js";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

/**
 * Generate a rainbow gradient test pattern
 */
function generateRainbowFrame(width: number, height: number) {
  const frame = createSolidFrame(width, height, { r: 0, g: 0, b: 0 });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Create a rainbow gradient based on position
      const hue = ((x + y) / (width + height)) * 360;
      const color = hslToRgb(hue, 100, 50);
      setPixel(frame, x, y, color);
    }
  }

  return frame;
}

/**
 * Generate a simple color bars test pattern
 */
function generateColorBarsFrame(width: number, height: number) {
  const frame = createSolidFrame(width, height, { r: 0, g: 0, b: 0 });
  const colors: RGB[] = [
    { r: 255, g: 0, b: 0 },     // Red
    { r: 255, g: 165, b: 0 },   // Orange
    { r: 255, g: 255, b: 0 },   // Yellow
    { r: 0, g: 255, b: 0 },     // Green
    { r: 0, g: 0, b: 255 },     // Blue
    { r: 75, g: 0, b: 130 },    // Indigo
    { r: 238, g: 130, b: 238 }, // Violet
    { r: 255, g: 255, b: 255 }, // White
  ];

  const barWidth = Math.floor(width / colors.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorIndex = Math.min(Math.floor(x / barWidth), colors.length - 1);
      setPixel(frame, x, y, colors[colorIndex]);
    }
  }

  return frame;
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

/**
 * Draw text on a frame
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
        // Check if this pixel is set (bit is 1)
        const bit = (bitmap[row] >> (CHAR_WIDTH - 1 - col)) & 1;
        if (bit) {
          setPixel(frame, cursorX + col, startY + row, color);
        }
      }
    }

    cursorX += CHAR_WIDTH + 1; // Move to next character position with 1px spacing
  }
}

/**
 * Generate a text frame
 */
function generateTextFrame(
  width: number,
  height: number,
  text: string,
  textColor: RGB = { r: 255, g: 255, b: 255 },
  bgColor: RGB = { r: 0, g: 0, b: 0 }
) {
  const frame = createSolidFrame(width, height, bgColor);

  // Split text into lines if needed
  const lines = text.split("\\n");
  const lineHeight = CHAR_HEIGHT + 2;
  const totalHeight = lines.length * lineHeight - 2;

  // Center vertically
  let startY = Math.floor((height - totalHeight) / 2);

  for (const line of lines) {
    // Center horizontally
    const textWidth = measureText(line);
    const startX = Math.floor((width - textWidth) / 2);

    drawText(frame, line, startX, startY, textColor);
    startY += lineHeight;
  }

  return frame;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const queryParams = event.queryStringParameters || {};
  const pattern = queryParams.pattern || "rainbow";
  const width = parseInt(queryParams.width || "64", 10);
  const height = parseInt(queryParams.height || "64", 10);
  const text = queryParams.text || "Hello";
  const color = queryParams.color || "white";

  console.log(`Generating ${pattern} test pattern ${width}x${height}`);

  // Parse color
  const colorMap: Record<string, RGB> = {
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
    orange: { r: 255, g: 165, b: 0 },
    pink: { r: 255, g: 105, b: 180 },
  };
  const textColor = colorMap[color] || colorMap.white;

  // Generate the test frame
  let frame;
  if (pattern === "text") {
    frame = generateTextFrame(width, height, text, textColor);
  } else if (pattern === "bars") {
    frame = generateColorBarsFrame(width, height);
  } else {
    frame = generateRainbowFrame(width, height);
  }

  const frameData = encodeFrameToBase64(frame);

  // Get WebSocket URL from environment or API Gateway
  const wsApiUrl = process.env.WEBSOCKET_URL;
  if (!wsApiUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "WEBSOCKET_URL not configured" }),
    };
  }

  // Parse WebSocket URL to get endpoint
  const url = new URL(wsApiUrl);
  const endpoint = `https://${url.host}/${url.pathname.split("/")[1] || ""}`;

  const apiClient = new ApiGatewayManagementApiClient({ endpoint });

  // Get all connections
  const result = await ddb.send(
    new ScanCommand({
      TableName: Resource.SignageTable.name,
      FilterExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: {
        ":prefix": "CONNECTION#",
      },
    })
  );

  const connections = result.Items || [];
  console.log(`Broadcasting to ${connections.length} connections`);

  // Send frame to all connections
  const frameMessage = JSON.stringify({
    type: "frame",
    payload: {
      frame: {
        width,
        height,
        data: frameData,
      },
    },
    timestamp: Date.now(),
  });

  let successCount = 0;
  let failCount = 0;

  const sendPromises = connections.map(async (conn) => {
    try {
      await apiClient.send(
        new PostToConnectionCommand({
          ConnectionId: conn.connectionId,
          Data: frameMessage,
        })
      );
      successCount++;
    } catch (error) {
      console.log(`Failed to send to ${conn.connectionId}:`, error);
      failCount++;
    }
  });

  await Promise.all(sendPromises);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      success: true,
      pattern,
      width,
      height,
      connections: {
        total: connections.length,
        success: successCount,
        failed: failCount,
      },
    }),
  };
};
