/**
 * Relay implementation
 * Maintains WebSocket connection to AWS and pushes frames to Pixoo
 */

import WebSocket from "ws";
import https from "https";
import { sendFrameToPixoo, initializePixoo } from "./pixoo-client.js";
import type { WsMessage, FramePayload } from "@signage/core";
import { decodeBase64ToPixels } from "@signage/core";
import { createBackoffController } from "./backoff.js";

// Force HTTP/1.1 to prevent ALPN from negotiating HTTP/2 (which doesn't support WebSocket)
const agent = new https.Agent({
  ALPNProtocols: ["http/1.1"],
});

export interface RelayOptions {
  pixooIp: string;
  wsUrl: string;
  terminalId?: string;
}

export async function startRelay(options: RelayOptions): Promise<void> {
  const { pixooIp, wsUrl, terminalId } = options;

  // Initialize Pixoo to custom channel mode
  try {
    await initializePixoo(pixooIp);
  } catch (error) {
    console.error("Failed to initialize Pixoo:", error);
  }

  const backoff = createBackoffController({
    initialDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 10,
  });

  const connect = () => {
    console.log("Connecting to WebSocket...");
    const ws = new WebSocket(wsUrl, { agent });

    let pingInterval: NodeJS.Timeout | null = null;

    ws.on("open", () => {
      console.log("WebSocket connected!");
      backoff.reset();

      // Register terminal if specified
      if (terminalId) {
        const registerMsg: WsMessage = {
          type: "connect",
          payload: { terminalId, type: "pixoo64" },
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(registerMsg));
      }

      // Send keepalive ping every 5 minutes to prevent idle disconnect
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const ping: WsMessage = {
            type: "ping",
            payload: {},
            timestamp: Date.now(),
          };
          ws.send(JSON.stringify(ping));
          console.log("Keepalive ping sent");
        }
      }, 5 * 60 * 1000);
    });

    ws.on("message", async (data) => {
      try {
        const message: WsMessage = JSON.parse(data.toString());

        if (message.type === "frame") {
          const payload = message.payload as FramePayload;
          console.log(
            `Received frame: ${payload.frame.width}x${payload.frame.height}`
          );

          // Decode and send to Pixoo
          const frame = decodeBase64ToPixels(
            payload.frame.data,
            payload.frame.width,
            payload.frame.height
          );
          await sendFrameToPixoo(pixooIp, frame);
          console.log("Frame sent to Pixoo");
        } else if (message.type === "ping") {
          const pong: WsMessage = {
            type: "pong",
            payload: {},
            timestamp: Date.now(),
          };
          ws.send(JSON.stringify(pong));
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket disconnected");
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }

      const state = backoff.next();
      if (state.exhausted) {
        console.error("Max reconnection attempts reached. Exiting.");
        process.exit(1);
      }

      console.log(
        `Reconnecting in ${state.nextDelay}ms (attempt ${state.attempt + 1}/10)...`
      );
      setTimeout(connect, state.nextDelay);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  };

  connect();

  // Keep process alive
  await new Promise(() => {});
}
