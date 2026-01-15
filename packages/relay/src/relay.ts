/**
 * Relay implementation
 * Maintains WebSocket connection to AWS and pushes frames to Pixoo
 */

import WebSocket from "ws";
import { sendFrameToPixoo } from "./pixoo-client";
import type { WsMessage, FramePayload } from "@signage/core";
import { decodeBase64ToPixels } from "@signage/core";

export interface RelayOptions {
  pixooIp: string;
  wsUrl: string;
  terminalId?: string;
}

export async function startRelay(options: RelayOptions): Promise<void> {
  const { pixooIp, wsUrl, terminalId } = options;

  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const reconnectDelay = 5000;

  const connect = () => {
    console.log("Connecting to WebSocket...");
    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log("WebSocket connected!");
      reconnectAttempts = 0;

      // Register terminal if specified
      if (terminalId) {
        const registerMsg: WsMessage = {
          type: "connect",
          payload: { terminalId, type: "pixoo64" },
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(registerMsg));
      }
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
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(
          `Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`
        );
        setTimeout(connect, reconnectDelay);
      } else {
        console.error("Max reconnection attempts reached. Exiting.");
        process.exit(1);
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  };

  connect();

  // Keep process alive
  await new Promise(() => {});
}
