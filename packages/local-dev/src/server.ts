#!/usr/bin/env node
/**
 * Local Development Server
 * Runs a WebSocket server and compositor for local testing.
 *
 * Uses the SAME rendering code as production - only the transport layer
 * (WebSocket server, client tracking) is different.
 *
 * On first run, prompts for widget credentials and saves to .env.local
 *
 * Usage:
 *   pnpm dev:local          # From repo root - starts server and web emulator
 *   pnpm dev:server         # Server only
 */

import { WebSocketServer, WebSocket } from "ws";
import { encodeFrameToBase64 } from "@signage/core";
// Import shared rendering code - same as production uses
import {
  generateCompositeFrame,
  classifyRange,
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  type BloodSugarDisplayData,
  type ChartPoint,
} from "@signage/functions/rendering";
import { runSetup, loadConfig, isInteractive, type LocalConfig } from "./setup.js";

// Configuration
const WS_PORT = 8080;
const UPDATE_INTERVAL_MS = 1000; // 1 second for clock updates

// Connected clients (in-memory instead of DynamoDB)
const clients = new Set<WebSocket>();

// Blood sugar state
let bloodSugarData: BloodSugarDisplayData | null = null;
let bloodSugarHistory: ChartPoint[] = [];
let useMockData = true;

// Frame cache - stores last broadcast frame for immediate send to new connections
let cachedFrameData: string | null = null;

// Credentials loaded from .env.local
let config: LocalConfig = {};

// Dexcom API (same as production)
const DEXCOM_BASE_URL = "https://share2.dexcom.com/ShareWebServices/Services";
const DEXCOM_APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Generate mock blood sugar data for testing without Dexcom credentials
 */
function generateMockBloodSugar(): BloodSugarDisplayData {
  // Generate realistic-ish values that change slowly over time
  const baseGlucose = 100 + Math.sin(Date.now() / 60000) * 40;
  const glucose = Math.round(baseGlucose + (Math.random() - 0.5) * 10);
  const delta = Math.round((Math.random() - 0.5) * 10);

  const trends = ["Flat", "FortyFiveUp", "FortyFiveDown", "SingleUp", "SingleDown"];
  const trend = trends[Math.floor(Math.random() * trends.length)];

  return {
    glucose,
    trend,
    delta,
    timestamp: Date.now() - Math.random() * 5 * 60 * 1000,
    rangeStatus: classifyRange(glucose),
    isStale: false,
  };
}

/**
 * Generate mock history data (24 hours of readings every 5 minutes)
 */
function generateMockHistory(): ChartPoint[] {
  const points: ChartPoint[] = [];
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // Generate a point every 5 minutes
  for (let t = twentyFourHoursAgo; t <= now; t += 5 * 60 * 1000) {
    // Create a smooth wave pattern with some noise
    const timeOffset = (t - twentyFourHoursAgo) / (24 * 60 * 60 * 1000);
    const baseValue = 120 + Math.sin(timeOffset * Math.PI * 8) * 50;
    const noise = (Math.random() - 0.5) * 20;
    const glucose = Math.round(Math.max(50, Math.min(300, baseValue + noise)));

    points.push({ timestamp: t, glucose });
  }

  return points;
}

/**
 * Fetch real blood sugar data from Dexcom (same logic as production)
 */
async function fetchRealBloodSugar(): Promise<BloodSugarDisplayData | null> {
  const username = config.dexcomUsername;
  const password = config.dexcomPassword;

  if (!username || !password) {
    return null;
  }

  try {
    // Authenticate
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

    const accountId = (await authResponse.json()) as string;

    // Get session
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

    const sessionId = (await sessionResponse.json()) as string;

    // Fetch readings
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

    interface DexcomReading {
      WT: string;
      Value: number;
      Trend: string;
    }

    const readings = (await response.json()) as DexcomReading[];

    if (!readings || readings.length === 0) {
      return null;
    }

    const latest = readings[0];
    const previous = readings[1];

    const match = latest.WT.match(/Date\((\d+)\)/);
    const timestamp = match ? parseInt(match[1], 10) : Date.now();

    const glucose = latest.Value;
    const delta = previous ? glucose - previous.Value : 0;

    return {
      glucose,
      trend: latest.Trend,
      delta,
      timestamp,
      rangeStatus: classifyRange(glucose),
      isStale: Date.now() - timestamp >= STALE_THRESHOLD_MS,
    };
  } catch (error) {
    console.error("Failed to fetch Dexcom data:", error);
    return null;
  }
}

/**
 * Fetch 24 hours of blood sugar history from Dexcom
 */
async function fetchRealHistory(): Promise<ChartPoint[]> {
  const username = config.dexcomUsername;
  const password = config.dexcomPassword;

  if (!username || !password) {
    return [];
  }

  try {
    // Authenticate
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

    const accountId = (await authResponse.json()) as string;

    // Get session
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

    const sessionId = (await sessionResponse.json()) as string;

    // Fetch 24 hours of readings (1440 minutes, ~288 readings)
    const response = await fetch(
      `${DEXCOM_BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=1440&maxCount=300`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`Dexcom history fetch failed: ${response.status}`);
    }

    interface DexcomReading {
      WT: string;
      Value: number;
      Trend: string;
    }

    const readings = (await response.json()) as DexcomReading[];

    if (!readings || readings.length === 0) {
      return [];
    }

    // Convert to chart points (readings come newest-first, so reverse)
    return readings
      .map((r) => {
        const match = r.WT.match(/Date\((\d+)\)/);
        const timestamp = match ? parseInt(match[1], 10) : 0;
        return { timestamp, glucose: r.Value };
      })
      .filter((p) => p.timestamp > 0)
      .reverse();
  } catch (error) {
    console.error("Failed to fetch Dexcom history:", error);
    return [];
  }
}

/**
 * Update blood sugar data (mock or real)
 */
async function updateBloodSugar(): Promise<void> {
  if (useMockData) {
    bloodSugarData = generateMockBloodSugar();
    bloodSugarHistory = generateMockHistory();
  } else {
    const realData = await fetchRealBloodSugar();
    if (realData) {
      bloodSugarData = realData;
    }
    // Fetch history less frequently (it's more expensive)
    const realHistory = await fetchRealHistory();
    if (realHistory.length > 0) {
      bloodSugarHistory = realHistory;
    }
  }
}

/**
 * Broadcast frame to all connected clients
 * (Local WebSocket instead of API Gateway)
 */
function broadcastFrame(): void {
  // Use the SAME frame generation as production
  const frame = generateCompositeFrame({
    bloodSugar: bloodSugarData,
    bloodSugarHistory: { points: bloodSugarHistory },
    timezone: "America/Los_Angeles",
  });

  const frameData = encodeFrameToBase64(frame);

  // Cache frame for new connections (even if no clients connected)
  cachedFrameData = frameData;

  if (clients.size === 0) return;

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

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Start the local development server
 */
async function startServer(): Promise<void> {
  // Run interactive setup if needed (or load existing config)
  if (isInteractive()) {
    config = await runSetup();
  } else {
    // Non-interactive mode (e.g., running in background) - just load config
    config = loadConfig();
  }

  // Check for Dexcom credentials
  if (config.dexcomUsername && config.dexcomPassword) {
    console.log("Using Dexcom credentials from .env.local");
    useMockData = false;
  } else {
    console.log("No Dexcom credentials - using mock blood sugar data");
  }

  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on("connection", (ws) => {
    console.log(`Client connected (total: ${clients.size + 1})`);
    clients.add(ws);

    // Send cached frame immediately (no compositing delay)
    if (cachedFrameData) {
      ws.send(
        JSON.stringify({
          type: "frame",
          payload: { frame: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, data: cachedFrameData } },
          timestamp: Date.now(),
        })
      );
    }

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`Client disconnected (total: ${clients.size})`);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", payload: {}, timestamp: Date.now() }));
        }
      } catch {
        // Ignore parse errors
      }
    });
  });

  console.log(`\n───────────────────────────────────────────`);
  console.log(`Local Development Server started!`);
  console.log(`WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`───────────────────────────────────────────`);
  console.log(`\nOpen http://localhost:5173 in your browser`);
  console.log(`(Run 'pnpm dev:web' in another terminal if not already running)\n`);
  console.log(`To reconfigure credentials, delete .env.local and restart`);

  // Initial blood sugar fetch and frame generation
  await updateBloodSugar();
  broadcastFrame(); // Generate initial cached frame

  // Update frame every second (for clock)
  setInterval(broadcastFrame, UPDATE_INTERVAL_MS);

  // Update blood sugar every minute
  setInterval(updateBloodSugar, 60 * 1000);
}

startServer().catch(console.error);
