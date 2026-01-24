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

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

/** Backoff configuration */
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

/**
 * Calculate next backoff delay with exponential increase
 */
function calculateBackoff(attempt: number): number {
  const delay = INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
  return Math.min(delay, MAX_BACKOFF_MS);
}

/**
 * WebSocket hook for connecting to the signage API
 * Features automatic reconnection with exponential backoff
 */
export function useWebSocket(url: string | undefined) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [frame, setFrame] = useState<Uint8Array | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  const decodeBase64 = useCallback((base64: string): Uint8Array => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }, []);

  const connect = useCallback(() => {
    if (!url) {
      console.log("No WebSocket URL provided");
      return;
    }

    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    setStatus("connecting");
    console.log(`Connecting to WebSocket: ${url} (attempt ${reconnectAttemptRef.current + 1})`);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setStatus("connected");
      reconnectAttemptRef.current = 0; // Reset backoff on successful connection

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
      setStatus("disconnected");
      wsRef.current = null;

      // Don't reconnect if close was intentional (component unmounting)
      if (intentionalCloseRef.current) {
        return;
      }

      // Schedule reconnection with exponential backoff
      const backoffMs = calculateBackoff(reconnectAttemptRef.current);
      console.log(`Reconnecting in ${backoffMs}ms...`);
      reconnectAttemptRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, backoffMs);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, [url, decodeBase64]);

  // Initial connection and cleanup
  useEffect(() => {
    intentionalCloseRef.current = false;
    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Reconnect on visibility change (tab focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && status === "disconnected") {
        console.log("Tab visible, attempting reconnect");
        reconnectAttemptRef.current = 0; // Reset backoff when user returns
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [connect, status]);

  // Legacy compatibility: connected boolean
  const connected = status === "connected";

  return { connected, status, frame };
}
