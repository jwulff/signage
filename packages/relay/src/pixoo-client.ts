/**
 * Pixoo HTTP client
 * Sends frames to Pixoo device via local HTTP API
 */

import type { Frame } from "@signage/core";
import { createPixooFrameCommand } from "@signage/core";

const PIXOO_PORT = 80;

// Use timestamp-based PicID to avoid caching across relay restarts
function getUniquePicId(): number {
  return Date.now() % 100000;
}

/**
 * Initialize Pixoo for API-controlled display
 * - Switch to channel 4 (API/cloud mode)
 * - Reset HTTP GIF ID to clear any cached state
 */
export async function initializePixoo(ip: string): Promise<void> {
  const url = `http://${ip}:${PIXOO_PORT}/post`;

  // Switch to channel 4
  const channelResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Command: "Channel/SetIndex", SelectIndex: 4 }),
  });

  if (!channelResp.ok) {
    throw new Error(`Pixoo channel switch failed: ${channelResp.status}`);
  }

  // Reset GIF state
  const resetResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Command: "Draw/ResetHttpGifId" }),
  });

  if (!resetResp.ok) {
    throw new Error(`Pixoo GIF reset failed: ${resetResp.status}`);
  }

  console.log("Pixoo initialized (channel 4 + GIF reset)");
}

export async function sendFrameToPixoo(ip: string, frame: Frame): Promise<void> {
  const url = `http://${ip}:${PIXOO_PORT}/post`;
  const picId = getUniquePicId();
  const command = createPixooFrameCommand(frame, { picId });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Pixoo request failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as { error_code: number };
  if (result.error_code !== 0) {
    throw new Error(`Pixoo error: ${JSON.stringify(result)}`);
  }
}

/**
 * Send a raw command to Pixoo
 */
export async function sendPixooCommand(
  ip: string,
  command: Record<string, unknown>
): Promise<unknown> {
  const url = `http://${ip}:${PIXOO_PORT}/post`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Pixoo request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
