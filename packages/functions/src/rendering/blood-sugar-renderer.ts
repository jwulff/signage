/**
 * Blood sugar region renderer
 */

import type { Frame, RGB } from "@signage/core";
import { setPixel } from "@signage/core";
import { drawText, drawTinyText, measureText, measureTinyText, DISPLAY_WIDTH } from "./text.js";
import { COLORS, type RangeStatus } from "./colors.js";
import { renderChart, type ChartPoint } from "./chart-renderer.js";
import type { TreatmentDisplayData } from "../glooko/types.js";

// Blood sugar region boundaries (compact layout, no Oura)
const BG_REGION_START = 21;
const BG_REGION_END = 63;

// Layout configuration - text on top, treatment chart, then glucose chart
const TEXT_ROW = 22; // 1px below divider at row 21
const TEXT_MARGIN = 1; // Left/right margin for text
const CHART_X = 1;
const CHART_WIDTH = DISPLAY_WIDTH - 2; // Full width minus margins

// Treatment chart (insulin/carbs) - 1/3 of available chart space
const TREATMENT_CHART_Y = 28; // After text (5px) + 1px margin
const TREATMENT_CHART_HEIGHT = 11; // Rows 28-38

// 1px blank separator at row 39

// Glucose chart - 2/3 of available chart space
const GLUCOSE_CHART_Y = 40; // After treatment chart + 1px gap
const GLUCOSE_CHART_HEIGHT = 23; // Rows 40-62

// Split chart: left half = 21h compressed, right half = 3h detailed
const CHART_LEFT_WIDTH = Math.floor(CHART_WIDTH / 2);
const CHART_RIGHT_WIDTH = CHART_WIDTH - CHART_LEFT_WIDTH;
const CHART_LEFT_HOURS = 21;
const CHART_RIGHT_HOURS = 3;

// Glucose thresholds (mg/dL)
const THRESHOLDS = {
  URGENT_LOW: 55,
  LOW: 70,
  HIGH: 180,
  VERY_HIGH: 250,
} as const;

/**
 * Blood sugar data for rendering
 */
export interface BloodSugarDisplayData {
  glucose: number;
  trend: string;
  delta: number;
  timestamp: number;
  rangeStatus: RangeStatus;
  isStale: boolean;
}

/**
 * Classify glucose value into range categories
 */
export function classifyRange(mgdl: number): RangeStatus {
  if (mgdl < THRESHOLDS.URGENT_LOW) return "urgentLow";
  if (mgdl < THRESHOLDS.LOW) return "low";
  if (mgdl <= THRESHOLDS.HIGH) return "normal";
  if (mgdl <= THRESHOLDS.VERY_HIGH) return "high";
  return "veryHigh";
}

/**
 * Compact trend arrow bitmaps (5 wide x 5 tall)
 * Matches 3x5 font height for consistent appearance
 * Each row is a byte, bits represent pixels left to right (5 bits used)
 */
const TREND_ARROWS: Record<string, number[]> = {
  // ↑↑ Double up - two stacked chevrons
  doubleup: [
    0b00100,
    0b01010,
    0b00000,
    0b00100,
    0b01010,
  ],
  // ↑ Single up arrow
  singleup: [
    0b00100,
    0b01110,
    0b10101,
    0b00100,
    0b00100,
  ],
  // ↗ Diagonal up-right
  fortyfiveup: [
    0b00111,
    0b00011,
    0b00101,
    0b01000,
    0b10000,
  ],
  // → Flat/steady
  flat: [
    0b00100,
    0b00010,
    0b11111,
    0b00010,
    0b00100,
  ],
  // ↘ Diagonal down-right
  fortyfivedown: [
    0b10000,
    0b01000,
    0b00101,
    0b00011,
    0b00111,
  ],
  // ↓ Single down arrow
  singledown: [
    0b00100,
    0b00100,
    0b10101,
    0b01110,
    0b00100,
  ],
  // ↓↓ Double down - two stacked chevrons
  doubledown: [
    0b01010,
    0b00100,
    0b00000,
    0b01010,
    0b00100,
  ],
};

const ARROW_WIDTH = 5;
const ARROW_HEIGHT = 5;

/**
 * Draw a trend arrow at specified position
 * Returns the width consumed (for text positioning)
 */
function drawTrendArrow(
  frame: Frame,
  trend: string,
  x: number,
  y: number,
  color: RGB
): number {
  const bitmap = TREND_ARROWS[trend.toLowerCase()];
  if (!bitmap) {
    // Unknown trend - draw a question mark area
    return 0;
  }

  for (let row = 0; row < ARROW_HEIGHT; row++) {
    for (let col = 0; col < ARROW_WIDTH; col++) {
      const bit = (bitmap[row] >> (ARROW_WIDTH - 1 - col)) & 1;
      if (bit) {
        const px = x + col;
        const py = y + row;
        if (px >= 0 && px < DISPLAY_WIDTH && py >= BG_REGION_START && py <= BG_REGION_END) {
          setPixel(frame, px, py, color);
        }
      }
    }
  }

  return ARROW_WIDTH + 1; // Width plus spacing
}

/**
 * Calculate minutes since a timestamp
 */
function minutesAgo(timestamp: number): number {
  return Math.floor((Date.now() - timestamp) / 60000);
}

/**
 * History data for the chart
 */
export interface BloodSugarHistory {
  points: ChartPoint[];
}

/**
 * Calculate Time in Range (TIR) percentage over the last 24 hours
 * TIR is the percentage of glucose readings within target range (70-180 mg/dL)
 */
export function calculateTIR(points: ChartPoint[]): number | null {
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // Filter to last 24 hours
  const recentPoints = points.filter((p) => p.timestamp >= twentyFourHoursAgo);

  if (recentPoints.length === 0) {
    return null;
  }

  // Count points in range (70-180 mg/dL)
  const inRange = recentPoints.filter(
    (p) => p.glucose >= THRESHOLDS.LOW && p.glucose <= THRESHOLDS.HIGH
  ).length;

  return Math.round((inRange / recentPoints.length) * 100);
}

/**
 * Calculate time markers for midnight, 6am, noon, 6pm in the last 24 hours
 */
function calculateTimeMarkers(timezone?: string): number[] {
  const tz = timezone || "America/Los_Angeles";
  const now = Date.now();
  const markers: number[] = [];

  // Get current hour in target timezone
  const nowDate = new Date(now);
  const tzHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(nowDate)
  );

  // Calculate how many ms ago was the start of the current hour in the target timezone
  const msIntoCurrentHour =
    nowDate.getMinutes() * 60 * 1000 +
    nowDate.getSeconds() * 1000 +
    nowDate.getMilliseconds();

  // Calculate timestamps for midnight (0), 6am (6), noon (12), 6pm (18)
  const markerHours = [0, 6, 12, 18];

  for (const markerHour of markerHours) {
    // How many hours ago was this marker?
    let hoursAgo = tzHour - markerHour;
    if (hoursAgo < 0) {
      hoursAgo += 24; // It was yesterday
    }

    // Calculate the timestamp
    const msAgo = hoursAgo * 60 * 60 * 1000 + msIntoCurrentHour;
    const markerTimestamp = now - msAgo;

    // Only include if within the last 24 hours
    if (now - markerTimestamp <= 24 * 60 * 60 * 1000) {
      markers.push(markerTimestamp);
    }
  }

  return markers;
}

/**
 * Center text with margins, clamping to stay on screen
 */
function centerXWithMargin(text: string): number {
  const textWidth = measureText(text);
  const centered = Math.floor((DISPLAY_WIDTH - textWidth) / 2);
  // Clamp so text doesn't go past margins
  const maxX = DISPLAY_WIDTH - textWidth - TEXT_MARGIN;
  return Math.max(TEXT_MARGIN, Math.min(centered, maxX));
}

/**
 * Calculate total insulin units in a time window
 * @param treatments - Array of treatment records
 * @param startTime - Start of window (inclusive)
 * @param endTime - End of window (exclusive)
 */
export function calculateInsulinTotal(
  treatments: TreatmentDisplayData["treatments"],
  startTime: number,
  endTime: number
): number {
  return treatments
    .filter((t) => t.type === "insulin" && t.timestamp >= startTime && t.timestamp < endTime)
    .reduce((sum, t) => sum + t.value, 0);
}

/**
 * Correct a timestamp that was incorrectly parsed as UTC when it was actually local time.
 *
 * The Glooko CSV parser had a bug where timestamps like "2026-01-25 10:00" were parsed
 * as UTC instead of the user's local timezone. This function corrects those timestamps.
 *
 * @param incorrectUtc - The timestamp that was incorrectly parsed as UTC
 * @param timezone - The timezone the original string was meant to represent
 * @returns The corrected UTC timestamp
 */
function correctTimezone(incorrectUtc: number, timezone: string): number {
  // The incorrectUtc represents what the parser thought was UTC,
  // but it was actually local time values. We need to figure out
  // what the offset should have been and add it.

  // Format the incorrect timestamp in UTC to get the original "local time" values
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const utcParts = utcFormatter.formatToParts(new Date(incorrectUtc));
  const utcHour = parseInt(utcParts.find(p => p.type === "hour")?.value || "0");
  const utcMinute = parseInt(utcParts.find(p => p.type === "minute")?.value || "0");
  const utcDay = parseInt(utcParts.find(p => p.type === "day")?.value || "0");
  const utcMonth = parseInt(utcParts.find(p => p.type === "month")?.value || "0");
  const utcYear = parseInt(utcParts.find(p => p.type === "year")?.value || "0");

  // Now format in the target timezone to see what time this UTC corresponds to there
  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const tzParts = tzFormatter.formatToParts(new Date(incorrectUtc));
  const tzHour = parseInt(tzParts.find(p => p.type === "hour")?.value || "0");
  const tzMinute = parseInt(tzParts.find(p => p.type === "minute")?.value || "0");
  const tzDay = parseInt(tzParts.find(p => p.type === "day")?.value || "0");
  const tzMonth = parseInt(tzParts.find(p => p.type === "month")?.value || "0");
  const tzYear = parseInt(tzParts.find(p => p.type === "year")?.value || "0");

  // Calculate the offset in minutes between what the string said vs what it meant
  // The original string values = UTC interpretation = (utcYear, utcMonth, utcDay, utcHour, utcMinute)
  // What the timestamp corresponds to in target TZ = (tzYear, tzMonth, tzDay, tzHour, tzMinute)
  // The offset = (tz values - utc values) converted to minutes

  const utcTotalMins = utcYear * 525600 + utcMonth * 43800 + utcDay * 1440 + utcHour * 60 + utcMinute;
  const tzTotalMins = tzYear * 525600 + tzMonth * 43800 + tzDay * 1440 + tzHour * 60 + tzMinute;

  // If tzTotalMins < utcTotalMins, the timezone is behind UTC (like PST = UTC-8)
  // The offset to add is: utcTotalMins - tzTotalMins (positive for PST)
  const offsetMinutes = utcTotalMins - tzTotalMins;

  return incorrectUtc + offsetMinutes * 60 * 1000;
}

/**
 * Correct all treatment timestamps that were incorrectly parsed as UTC.
 * This is a migration shim for data stored before the parser was fixed.
 */
function correctTreatmentTimestamps(
  treatments: TreatmentDisplayData["treatments"],
  timezone: string
): TreatmentDisplayData["treatments"] {
  return treatments.map(t => ({
    ...t,
    timestamp: correctTimezone(t.timestamp, timezone),
  }));
}

/**
 * Get midnight timestamp for a given date in a timezone.
 * Works correctly regardless of runtime timezone (e.g., UTC on Lambda).
 */
function getMidnightTimestamp(date: Date, timezone: string): number {
  // Get the current time-of-day in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  const second = parseInt(parts.find(p => p.type === "second")?.value || "0");

  // Calculate seconds since midnight in the target timezone
  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;

  // Subtract that from the timestamp to get midnight
  return date.getTime() - secondsSinceMidnight * 1000;
}

/**
 * Render treatment chart showing last 4 days of insulin totals (midnight to midnight)
 */
function renderTreatmentChart(
  frame: Frame,
  treatments: TreatmentDisplayData,
  timezone?: string
): void {
  const now = Date.now();
  const tz = timezone || "America/Los_Angeles";

  // Correct treatment timestamps that were incorrectly parsed as UTC
  // This is a migration shim for data stored before the parser was fixed
  const treatmentList = correctTreatmentTimestamps(treatments.treatments, tz);

  // Calculate midnights for each of the last 4 days
  // We calculate each separately to handle DST transitions correctly
  // (a calendar day may be 23h or 25h on DST change days)
  const midnights: number[] = [];
  let datePointer = new Date(now);

  // Get today's midnight
  midnights.push(getMidnightTimestamp(datePointer, tz));

  // Go back 3 more days, calculating each midnight separately
  for (let i = 0; i < 3; i++) {
    // Go back 30 hours (safely past one day boundary) then find that day's midnight
    datePointer = new Date(datePointer.getTime() - 30 * 60 * 60 * 1000);
    midnights.unshift(getMidnightTimestamp(datePointer, tz));
  }

  // midnights = [3 days ago, 2 days ago, yesterday, today]
  // Calculate insulin totals for each day
  const dayTotals: number[] = [];
  for (let i = 0; i < 4; i++) {
    const dayStart = midnights[i];
    // Today (i=3) ends at now, other days end at next midnight
    const dayEnd = i === 3 ? now : midnights[i + 1];
    const total = calculateInsulinTotal(treatmentList, dayStart, dayEnd);
    dayTotals.push(total);
  }

  // Format numbers for display (cap at 99+ to indicate truncation)
  const formatInsulin = (value: number): string => {
    const rounded = Math.round(value);
    return rounded > 99 ? "99+" : String(rounded);
  };

  const dayStrs = dayTotals.map(formatInsulin);

  // Find the most recent insulin treatment timestamp
  const insulinTreatments = treatmentList.filter(t => t.type === "insulin");
  const lastInsulinTime = insulinTreatments.length > 0
    ? Math.max(...insulinTreatments.map(t => t.timestamp))
    : 0;

  // Format latency indicator (time since last known insulin delivery)
  const formatLatency = (lastTimestamp: number): string => {
    if (lastTimestamp === 0) return "?";
    const msAgo = now - lastTimestamp;
    const minsAgo = Math.floor(msAgo / (60 * 1000));
    if (minsAgo < 60) {
      return `${minsAgo}m`;
    }
    const hoursAgo = Math.ceil(minsAgo / 60);
    return `${hoursAgo}h`;
  };
  const latencyStr = formatLatency(lastInsulinTime);

  // Calculate total width needed (4 day totals + latency)
  const dayWidths = dayStrs.map(s => measureTinyText(s));
  const latencyWidth = measureTinyText(latencyStr);
  const totalTextWidth = dayWidths.reduce((a, b) => a + b, 0) + latencyWidth;

  // Available width for the treatment chart
  const availableWidth = CHART_WIDTH;

  // Calculate spacing between numbers (3 gaps between 4 day totals + 1 gap before latency)
  const numGaps = 4; // 4 gaps total
  const extraSpace = availableWidth - totalTextWidth;
  const spacing = Math.max(2, Math.floor(extraSpace / numGaps));

  // Center the content
  const totalUsedWidth = totalTextWidth + numGaps * spacing;
  const startX = CHART_X + Math.max(0, Math.floor((availableWidth - totalUsedWidth) / 2));

  // Vertical positioning - center text in chart area
  const textY = TREATMENT_CHART_Y + Math.floor((TREATMENT_CHART_HEIGHT - 5) / 2);

  // Brightness gradient: oldest (dimmest) to newest (brightest)
  const getDayColor = (index: number): RGB => {
    // index 0 = oldest (dimmest), index 3 = newest (brightest)
    const brightness = 0.3 + (index / 3) * 0.7; // 0.3 to 1.0
    return {
      r: Math.round(100 * brightness),
      g: Math.round(150 * brightness),
      b: Math.round(255 * brightness),
    };
  };

  // Draw 4 day totals
  let x = startX;
  for (let i = 0; i < 4; i++) {
    const color = getDayColor(i);
    drawTinyText(frame, dayStrs[i], x, textY, color);
    x += dayWidths[i] + spacing;
  }

  // Draw latency indicator (same color as clock time - white/grey)
  drawTinyText(frame, latencyStr, x, textY, COLORS.clockTime);
}

/**
 * Render blood sugar widget to bottom region of frame
 * Layout: text on top, treatment chart, then glucose sparkline
 */
export function renderBloodSugarRegion(
  frame: Frame,
  data: BloodSugarDisplayData | null,
  history?: BloodSugarHistory,
  timezone?: string,
  treatments?: TreatmentDisplayData | null
): void {
  if (!data) {
    const errText = "BG ERR";
    drawText(frame, errText, centerXWithMargin(errText), TEXT_ROW, COLORS.urgentLow, BG_REGION_START, BG_REGION_END);
    return;
  }

  const { glucose, trend, delta, timestamp, rangeStatus, isStale } = data;
  const valueColor = isStale ? COLORS.stale : COLORS[rangeStatus];

  // Top: Arrow + reading + delta + time
  // Use spaces when there's room, remove them when tight
  const deltaStr = delta >= 0 ? `+${delta}` : String(delta);
  const mins = minutesAgo(timestamp);

  // Calculate widths for different spacing options
  const glucoseStr = String(glucose);
  const timeStr = `${mins}m`;

  // Full spacing: "194 +8 5m"
  const fullText = `${glucoseStr} ${deltaStr} ${timeStr}`;
  const fullWidth = ARROW_WIDTH + 2 + measureText(fullText);

  // Tight spacing: "194+8 5m" (remove space after glucose)
  const tightText = `${glucoseStr}${deltaStr} ${timeStr}`;
  const tightWidth = ARROW_WIDTH + 2 + measureText(tightText);

  // Available width (with margins)
  const availableWidth = DISPLAY_WIDTH - TEXT_MARGIN * 2;

  // Choose spacing based on fit
  const useFullSpacing = fullWidth <= availableWidth;
  const totalWidth = useFullSpacing ? fullWidth : tightWidth;

  // Center, but ensure margins on both sides
  const maxStartX = DISPLAY_WIDTH - totalWidth - TEXT_MARGIN;
  const centered = Math.floor((DISPLAY_WIDTH - totalWidth) / 2);
  const startX = Math.max(TEXT_MARGIN, Math.min(centered, maxStartX));

  // Draw arrow in glucose color
  drawTrendArrow(frame, trend, startX, TEXT_ROW, valueColor);

  // Draw glucose value in range color
  let textX = startX + ARROW_WIDTH + 2;
  drawText(frame, glucoseStr, textX, TEXT_ROW, valueColor, BG_REGION_START, BG_REGION_END);
  textX += measureText(glucoseStr);

  // Add space if using full spacing (use measureText for font-consistent spacing)
  if (useFullSpacing) {
    textX += measureText(" ");
  }

  // Draw delta and time in white
  const secondaryColor = COLORS.clockTime; // white
  const deltaTimeStr = useFullSpacing ? `${deltaStr} ${timeStr}` : `${deltaStr} ${timeStr}`;
  drawText(frame, deltaTimeStr, textX, TEXT_ROW, secondaryColor, BG_REGION_START, BG_REGION_END);

  // Treatment chart (4-day midnight-to-midnight insulin totals)
  if (treatments && !treatments.isStale) {
    renderTreatmentChart(frame, treatments, timezone);
  }

  // Glucose sparkline chart (split: 21h compressed | 3h detailed)
  if (history && history.points.length > 0) {
    const legendY = GLUCOSE_CHART_Y + GLUCOSE_CHART_HEIGHT - 5; // 5px tiny font, at bottom
    const rightX = CHART_X + CHART_LEFT_WIDTH;

    // Calculate time markers (midnight, 6am, noon, 6pm) for both charts
    const timeMarkers = calculateTimeMarkers(timezone);

    // Draw labels FIRST so sparkline renders on top
    drawTinyText(frame, `${CHART_LEFT_HOURS}h`, CHART_X, legendY, COLORS.veryDim);
    drawTinyText(frame, `${CHART_RIGHT_HOURS}h`, rightX, legendY, COLORS.veryDim);

    // TIR percentage in bottom right corner
    const tir = calculateTIR(history.points);
    if (tir !== null) {
      const tirStr = `${tir}%`;
      const tirX = CHART_X + CHART_WIDTH - measureTinyText(tirStr);
      drawTinyText(frame, tirStr, tirX, legendY, COLORS.veryDim);
    }

    // Left half: 21 hour compressed history (from -24h to -3h, offset by 3h)
    renderChart(frame, history.points, {
      x: CHART_X,
      y: GLUCOSE_CHART_Y,
      width: CHART_LEFT_WIDTH,
      height: GLUCOSE_CHART_HEIGHT,
      hours: CHART_LEFT_HOURS,
      offsetHours: CHART_RIGHT_HOURS, // Offset by 3h so it shows -24h to -3h
      timeMarkers,
      timezone,
    });

    // Right half: 3 hour detailed history
    renderChart(frame, history.points, {
      x: rightX,
      y: GLUCOSE_CHART_Y,
      width: CHART_RIGHT_WIDTH,
      height: GLUCOSE_CHART_HEIGHT,
      hours: CHART_RIGHT_HOURS,
      timeMarkers,
      timezone,
    });
    drawTinyText(frame, `${CHART_RIGHT_HOURS}h`, rightX, legendY, COLORS.veryDim);
  }
}

// Re-export ChartPoint for convenience
export type { ChartPoint };
