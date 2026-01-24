/**
 * Blood sugar region renderer
 */

import type { Frame, RGB } from "@signage/core";
import { setPixel } from "@signage/core";
import { drawText, drawTinyText, measureText, measureTinyText, DISPLAY_WIDTH } from "./text.js";
import { COLORS, type RangeStatus } from "./colors.js";
import { renderChart, type ChartPoint } from "./chart-renderer.js";

// Blood sugar region boundaries
const BG_REGION_START = 32;
const BG_REGION_END = 63;

// Layout configuration - text on top, chart fills rest
const TEXT_ROW = 34; // 2px margin from top of region (buffer from divider)
const TEXT_MARGIN = 1; // Left/right margin for text
const CHART_X = 1;
const CHART_Y = 42; // After text (8px) + 1px margin
const CHART_WIDTH = DISPLAY_WIDTH - 2; // Full width minus margins
const CHART_HEIGHT = 21; // Rows 42-62, maximize vertical space

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
 * Trend arrow bitmaps (7 wide x 8 tall) with outlined arrow heads
 * Each row is a byte, bits represent pixels left to right
 */
const TREND_ARROWS: Record<string, number[]> = {
  // ↑↑ Double up - two outlined chevrons
  doubleup: [
    0b0001000,
    0b0010100,
    0b0100010,
    0b0001000,
    0b0010100,
    0b0100010,
    0b0000000,
    0b0000000,
  ],
  // ↑ Single up arrow with outlined head
  singleup: [
    0b0001000,
    0b0010100,
    0b0100010,
    0b0001000,
    0b0001000,
    0b0001000,
    0b0001000,
    0b0000000,
  ],
  // ↗ Diagonal up-right with outlined head
  fortyfiveup: [
    0b0001110,
    0b0000110,
    0b0001010,
    0b0010000,
    0b0100000,
    0b1000000,
    0b0000000,
    0b0000000,
  ],
  // → Flat/steady with outlined head
  flat: [
    0b0000000,
    0b0000100,
    0b0000010,
    0b1111111,
    0b0000010,
    0b0000100,
    0b0000000,
    0b0000000,
  ],
  // ↘ Diagonal down-right with outlined head
  fortyfivedown: [
    0b0000000,
    0b0000000,
    0b1000000,
    0b0100000,
    0b0010000,
    0b0001010,
    0b0000110,
    0b0001110,
  ],
  // ↓ Single down arrow with outlined head
  singledown: [
    0b0000000,
    0b0001000,
    0b0001000,
    0b0001000,
    0b0001000,
    0b0100010,
    0b0010100,
    0b0001000,
  ],
  // ↓↓ Double down - two outlined chevrons
  doubledown: [
    0b0000000,
    0b0000000,
    0b0100010,
    0b0010100,
    0b0001000,
    0b0100010,
    0b0010100,
    0b0001000,
  ],
};

const ARROW_WIDTH = 7;
const ARROW_HEIGHT = 8;

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
 * Render blood sugar widget to bottom region of frame
 * Layout: "- 181 +7 1m" on top, sparkline on bottom
 */
export function renderBloodSugarRegion(
  frame: Frame,
  data: BloodSugarDisplayData | null,
  history?: BloodSugarHistory,
  timezone?: string
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

  // Add space if using full spacing
  if (useFullSpacing) {
    textX += 6; // space width
  }

  // Draw delta and time in white
  const secondaryColor = COLORS.clockTime; // white
  const deltaTimeStr = useFullSpacing ? `${deltaStr} ${timeStr}` : `${deltaStr} ${timeStr}`;
  drawText(frame, deltaTimeStr, textX, TEXT_ROW, secondaryColor, BG_REGION_START, BG_REGION_END);

  // Bottom: Split sparkline chart (21h compressed | 3h detailed)
  if (history && history.points.length > 0) {
    const legendY = CHART_Y + CHART_HEIGHT - 5; // 5px tiny font, at bottom

    // Calculate time markers (midnight, 6am, noon, 6pm) for both charts
    const timeMarkers = calculateTimeMarkers(timezone);

    // Left half: 21 hour compressed history (from -24h to -3h, offset by 3h)
    renderChart(frame, history.points, {
      x: CHART_X,
      y: CHART_Y,
      width: CHART_LEFT_WIDTH,
      height: CHART_HEIGHT,
      hours: CHART_LEFT_HOURS,
      offsetHours: CHART_RIGHT_HOURS, // Offset by 3h so it shows -24h to -3h
      timeMarkers,
      timezone,
    });
    drawTinyText(frame, `${CHART_LEFT_HOURS}h`, CHART_X, legendY, COLORS.veryDim);

    // Right half: 3 hour detailed history
    const rightX = CHART_X + CHART_LEFT_WIDTH;
    renderChart(frame, history.points, {
      x: rightX,
      y: CHART_Y,
      width: CHART_RIGHT_WIDTH,
      height: CHART_HEIGHT,
      hours: CHART_RIGHT_HOURS,
      timeMarkers,
      timezone,
    });
    drawTinyText(frame, `${CHART_RIGHT_HOURS}h`, rightX, legendY, COLORS.veryDim);

    // TIR percentage in bottom right corner
    const tir = calculateTIR(history.points);
    if (tir !== null) {
      const tirStr = `${tir}%`;
      const tirX = CHART_X + CHART_WIDTH - measureTinyText(tirStr);
      drawTinyText(frame, tirStr, tirX, legendY, COLORS.veryDim);
    }
  }
}

// Re-export ChartPoint for convenience
export type { ChartPoint };
