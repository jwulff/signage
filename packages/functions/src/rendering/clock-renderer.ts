/**
 * Clock region renderer
 */

import type { Frame } from "@signage/core";
import { drawText, centerX } from "./text.js";
import { COLORS } from "./colors.js";

// Clock region boundaries
const CLOCK_REGION_START = 0;
const CLOCK_REGION_END = 31;

/**
 * Render clock widget to top region of frame
 */
export function renderClockRegion(frame: Frame, timezone = "America/Los_Angeles"): void {
  const now = new Date();
  const localTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  let hours = localTime.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = String(localTime.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Row 4: Time (larger, centered)
  drawText(frame, timeStr, centerX(timeStr), 4, COLORS.clockTime, CLOCK_REGION_START, CLOCK_REGION_END);

  // Row 18: AM/PM
  drawText(frame, ampm, centerX(ampm), 18, COLORS.clockAmPm, CLOCK_REGION_START, CLOCK_REGION_END);
}
