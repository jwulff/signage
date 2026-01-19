/**
 * News Digest Widget
 * Fetches current news using Bedrock with web grounding and displays on signage
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createSolidFrame, setPixel, encodeFrameToBase64 } from "@signage/core";
import type { RGB, Frame } from "@signage/core";
import { getCharBitmap, CHAR_WIDTH, CHAR_HEIGHT } from "./font";
import { wrapText } from "./text-utils";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" });

// Display constants
const DISPLAY_WIDTH = 64;
const DISPLAY_HEIGHT = 64;
const MAX_CHARS_PER_LINE = 10; // 64px / 6px per char
const HEADLINE_DELAY_MS = 2000;

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
 * Generate a frame for a single headline
 */
function generateHeadlineFrame(
  headline: string,
  index: number,
  total: number
): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, BG_COLOR);

  // Draw "NEWS" header centered at top
  const headerText = "NEWS";
  const headerWidth = headerText.length * (CHAR_WIDTH + 1) - 1;
  const headerX = Math.floor((DISPLAY_WIDTH - headerWidth) / 2);
  drawText(frame, headerText, headerX, 2, HEADER_COLOR);

  // Wrap headline text
  const lines = wrapText(headline.toUpperCase(), MAX_CHARS_PER_LINE);
  const maxLines = 4; // Leave room for header and position indicator
  const displayLines = lines.slice(0, maxLines);

  // Center headline vertically in middle area (y: 14 to 50)
  const lineHeight = CHAR_HEIGHT + 2;
  const totalTextHeight = displayLines.length * lineHeight - 2;
  let startY = 14 + Math.floor((36 - totalTextHeight) / 2);

  for (const line of displayLines) {
    const lineWidth = line.length * (CHAR_WIDTH + 1) - 1;
    const lineX = Math.floor((DISPLAY_WIDTH - lineWidth) / 2);
    drawText(frame, line, lineX, startY, TEXT_COLOR);
    startY += lineHeight;
  }

  // Draw position indicator at bottom
  const posText = `${index + 1}/${total}`;
  const posWidth = posText.length * (CHAR_WIDTH + 1) - 1;
  const posX = Math.floor((DISPLAY_WIDTH - posWidth) / 2);
  drawText(frame, posText, posX, 56, DIM_COLOR);

  return frame;
}

/**
 * Fetch news headlines using Bedrock with web grounding
 */
async function fetchHeadlines(topic: string): Promise<string[]> {
  const prompt = `Give me exactly 5 current news headlines about ${topic}.
Format as a simple numbered list like:
1. Headline one here
2. Headline two here
...

Keep each headline under 40 characters. Be concise. Only output the numbered list, nothing else.`;

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: "us.amazon.nova-lite-v1:0",
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 500,
        temperature: 0.7,
      },
      toolConfig: {
        tools: [
          {
            systemTool: {
              name: "nova_grounding",
            },
          },
        ],
      },
    })
  );

  // Extract text from response
  const outputContent = response.output?.message?.content;
  if (!outputContent || outputContent.length === 0) {
    throw new Error("No response from Bedrock");
  }

  const text =
    outputContent[0].text || (outputContent[0] as { text?: string }).text || "";

  // Parse numbered headlines
  const headlines: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Match lines starting with a number followed by . or )
    const match = line.match(/^\d+[.)]\s*(.+)/);
    if (match && match[1]) {
      const headline = match[1].trim();
      if (headline.length > 0) {
        headlines.push(headline);
      }
    }
  }

  return headlines.slice(0, 5); // Ensure max 5
}

/**
 * Get active WebSocket connections from DynamoDB
 * Paginates through all results to handle tables with >1MB of connection data
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
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const queryParams = event.queryStringParameters || {};
  const topic = queryParams.topic || "technology";

  console.log(`News digest requested for topic: ${topic}`);

  // Check for active connections first
  const connections = await getActiveConnections();

  if (connections.length === 0) {
    console.log("No active connections, skipping Bedrock call");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        skipped: true,
        reason: "No active connections",
        topic,
      }),
    };
  }

  console.log(`Found ${connections.length} active connections`);

  // Get WebSocket endpoint
  const wsApiUrl = process.env.WEBSOCKET_URL;
  if (!wsApiUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "WEBSOCKET_URL not configured" }),
    };
  }

  const url = new URL(wsApiUrl);
  const endpoint = `https://${url.host}/${url.pathname.split("/")[1] || ""}`;
  const apiClient = new ApiGatewayManagementApiClient({ endpoint });

  // Fetch headlines from Bedrock
  let headlines: string[];
  try {
    headlines = await fetchHeadlines(topic);
    console.log(`Fetched ${headlines.length} headlines`);
  } catch (error) {
    console.error("Failed to fetch headlines:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to fetch headlines",
        details: error instanceof Error ? error.message : String(error),
      }),
    };
  }

  if (headlines.length === 0) {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        warning: "No headlines found",
        topic,
      }),
    };
  }

  // Broadcast each headline with delay
  const results: Array<{ headline: string; success: number; failed: number }> =
    [];

  for (let i = 0; i < headlines.length; i++) {
    const headline = headlines[i];
    const frame = generateHeadlineFrame(headline, i, headlines.length);
    const { success, failed } = await broadcastFrame(
      apiClient,
      connections as Array<{ connectionId: string }>,
      frame
    );
    results.push({ headline, success, failed });

    // Delay between headlines (except after last one)
    if (i < headlines.length - 1) {
      await sleep(HEADLINE_DELAY_MS);
    }
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      success: true,
      topic,
      headlines: results,
      connections: connections.length,
    }),
  };
};
