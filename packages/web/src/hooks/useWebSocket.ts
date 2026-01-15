import { useState, useEffect, useRef, useCallback } from "react";

interface WsMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

interface FramePayload {
  frame: {
    width: number;
    height: number;
    data: string; // Base64
  };
}

/**
 * WebSocket hook for connecting to the signage API
 */
export function useWebSocket(url: string | undefined) {
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState<Uint8Array | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const decodeBase64 = useCallback((base64: string): Uint8Array => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }, []);

  useEffect(() => {
    if (!url) {
      console.log("No WebSocket URL provided");
      return;
    }

    console.log("Connecting to WebSocket:", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnected(true);

      // Register as web emulator
      const registerMsg: WsMessage = {
        type: "connect",
        payload: { type: "web" },
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(registerMsg));
    };

    ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);

        if (message.type === "frame") {
          const payload = message.payload as FramePayload;
          const pixels = decodeBase64(payload.frame.data);
          setFrame(pixels);
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
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, [url, decodeBase64]);

  return { connected, frame };
}
