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

export async function sendFrameToPixoo(ip: string, frame: Frame): Promise<void> {
  const url = `http://${ip}:${PIXOO_PORT}/post`;
  // Use timestamp-based PicID to ensure Pixoo always updates the display
  const command = createPixooFrameCommand(frame, { picId: getUniquePicId() });

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
