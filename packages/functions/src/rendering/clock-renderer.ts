/**
 * Clock region renderer
 */

import type { Frame } from "@signage/core";
import { drawText, measureText, DISPLAY_WIDTH } from "./text.js";
import { COLORS } from "./colors.js";

// Clock region boundaries (compact - just date/time at top)
const CLOCK_REGION_START_Y = 0;
const CLOCK_REGION_END_Y = 6; // Rows 0-6 for date/time only

/**
 * Region bounds for clock rendering
 */
export interface ClockRegionBounds {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

/**
 * Hourly weather conditions (kept for API compatibility)
 */
export interface HourlyCondition {
  temp?: number;
  cloudCover?: number;      // 0-100 percentage
  precipitation?: number;   // mm of rain/snow
  isSnow?: boolean;         // true if precipitation is snow
}

/**
 * Weather data for the clock display (kept for API compatibility)
 * Note: Weather band is disabled in current layout to maximize chart space
 */
export interface ClockWeatherData {
  // Temperatures in Fahrenheit at 5 time points (legacy, for compatibility)
  tempMinus12h?: number;
  tempMinus6h?: number;
  tempNow?: number;
  tempPlus6h?: number;
  tempPlus12h?: number;
  // Full hourly data for gradient rendering (index 0 = midnight today)
  hourlyConditions?: HourlyCondition[];
  // Current hour index in the hourlyConditions array
  currentHourIndex?: number;
}

/**
 * Calculate center X position within a bounded region
 */
function centerXInBounds(text: string, startX: number, endX: number): number {
  const regionWidth = endX - startX + 1;
  const textWidth = measureText(text);
  return startX + Math.floor((regionWidth - textWidth) / 2);
}

/**
 * Render clock widget to top region of frame
 * Shows date and time on a single line at the top of the display
 */
export function renderClockRegion(
  frame: Frame,
  timezone = "America/Los_Angeles",
  _weather?: ClockWeatherData, // Weather param kept for API compatibility but not used
  bounds?: ClockRegionBounds
): void {
  const now = new Date();
  const localTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  let hours = localTime.getHours();
  hours = hours % 12 || 12;
  const minutes = String(localTime.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Default bounds (full width top region)
  const startX = bounds?.startX ?? 0;
  const endX = bounds?.endX ?? DISPLAY_WIDTH - 1;
  const startY = bounds?.startY ?? CLOCK_REGION_START_Y;
  const endY = bounds?.endY ?? CLOCK_REGION_END_Y;
  const regionWidth = endX - startX + 1;

  // Narrow region (32px or less) - simplified clock
  if (regionWidth <= 32) {
    // Center time horizontally within the region
    const timeX = centerXInBounds(timeStr, startX, endX);

    // Vertically center within the region
    const regionHeight = endY - startY + 1;
    const timeY = startY + Math.floor((regionHeight - 10) / 2); // 10px approx text height

    drawText(frame, timeStr, timeX, timeY, COLORS.clockTime, startY, endY);
    return;
  }

  // Full-width region - date and time on single row: "SAT JAN 24 11:09"
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const dayName = days[localTime.getDay()];
  const monthName = months[localTime.getMonth()];
  const dayNum = localTime.getDate();
  const dateStr = `${dayName} ${monthName} ${dayNum} `;
  const dateTimeStr = `${dateStr}${timeStr}`;

  // Draw date (dimmer) and time (brighter) with different colors
  const dateTimeX = centerXInBounds(dateTimeStr, startX, endX);
  const dateWidth = measureText(dateStr);
  drawText(frame, dateStr, dateTimeX, startY + 1, COLORS.clockSecondary, startY, endY);
  drawText(frame, timeStr, dateTimeX + dateWidth + 1, startY + 1, COLORS.clockTime, startY, endY);
}
