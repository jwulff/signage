/**
 * Core types for the signage system
 */

/** Unique identifier for a terminal (display device) */
export type TerminalId = string;

/** Unique identifier for a widget */
export type WidgetId = string;

/** Unique identifier for a WebSocket connection */
export type ConnectionId = string;

/** Display dimensions */
export interface DisplaySize {
  width: number;
  height: number;
}

/** RGB color (0-255 per channel) */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** A single frame of pixel data */
export interface Frame {
  width: number;
  height: number;
  /** Flat array of RGB values: [r0,g0,b0, r1,g1,b1, ...] */
  pixels: Uint8Array;
}

/** Terminal configuration */
export interface Terminal {
  id: TerminalId;
  name: string;
  size: DisplaySize;
  type: "pixoo64" | "web" | "other";
  /** IP address for Pixoo devices */
  ipAddress?: string;
}

/** Widget data update message */
export interface WidgetUpdate {
  widgetId: WidgetId;
  data: unknown;
  timestamp: number;
}

/** WebSocket message types */
export type WsMessageType = "frame" | "connect" | "disconnect" | "ping" | "pong";

/** WebSocket message envelope */
export interface WsMessage {
  type: WsMessageType;
  payload: unknown;
  timestamp: number;
}

/** Frame message payload */
export interface FramePayload {
  terminalId?: TerminalId;
  frame: {
    width: number;
    height: number;
    /** Base64-encoded RGB pixel data */
    data: string;
  };
}

/** Widget configuration */
export interface WidgetConfig {
  widgetId: WidgetId;
  enabled: boolean;
  settings?: Record<string, unknown>;
}

/** Widget state stored in DynamoDB */
export interface WidgetState {
  widgetId: WidgetId;
  lastRun: string;
  lastData: unknown;
  errorCount: number;
  lastError?: string;
}
