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
    0b00100,
    0b01010,
    0b00000,
  ],
  // ↑ Single up arrow
  singleup: [
    0b00100,
    0b01110,
    0b00100,
    0b00100,
    0b00100,
  ],
  // ↗ Diagonal up-right
  fortyfiveup: [
    0b01111,
    0b00011,
    0b00101,
    0b01000,
    0b10000,
  ],
  // → Flat/steady
  flat: [
    0b00000,
    0b00100,
    0b11111,
    0b00100,
    0b00000,
  ],
  // ↘ Diagonal down-right
  fortyfivedown: [
    0b10000,
    0b01000,
    0b00101,
    0b00011,
    0b01111,
  ],
  // ↓ Single down arrow
  singledown: [
    0b00100,
    0b00100,
    0b00100,
    0b01110,
    0b00100,
  ],
  // ↓↓ Double down - two stacked chevrons
  doubledown: [
    0b00000,
    0b01010,
    0b00100,
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

// Treatment chart colors
const TREATMENT_COLORS = {
  insulin: { r: 100, g: 150, b: 255 }, // Light blue
  carbs: { r: 255, g: 180, b: 100 }, // Light orange
  centerLine: { r: 40, g: 40, b: 40 }, // Dim gray
} as const;

/**
 * Calculate total insulin units in a time window
 */
function calculateInsulinTotal(
  treatments: TreatmentDisplayData["treatments"],
  startTime: number,
  endTime: number
): number {
  return treatments
    .filter((t) => t.type === "insulin" && t.timestamp >= startTime && t.timestamp <= endTime)
    .reduce((sum, t) => sum + t.value, 0);
}

/**
 * Render treatment chart:
 * - Left half: Treatment bars (21h window, 24h-3h ago) matching glucose chart
 * - Right half: 3-day insulin comparison as numbers (same 21h window across 3 days)
 */
function renderTreatmentChart(
  frame: Frame,
  treatments: TreatmentDisplayData
): void {
  if (!treatments.treatments || treatments.treatments.length === 0) return;

  const { treatments: treatmentList } = treatments;
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;

  // Left section: bars for 21h window (24h-3h ago)
  const leftStartTime = now - 24 * HOUR_MS;
  const leftEndTime = now - 3 * HOUR_MS;

  // Filter treatments for left section
  const leftTreatments = treatmentList.filter(
    (t) => t.timestamp >= leftStartTime && t.timestamp <= leftEndTime
  );

  // Find max values for scaling
  let maxInsulin = 0;
  let maxCarbs = 0;
  for (const t of leftTreatments) {
    if (t.type === "insulin") {
      maxInsulin = Math.max(maxInsulin, t.value);
    } else {
      maxCarbs = Math.max(maxCarbs, t.value);
    }
  }
  maxInsulin = Math.max(maxInsulin, 5);
  maxCarbs = Math.max(maxCarbs, 30);

  // Center line Y position
  const centerY = TREATMENT_CHART_Y + Math.floor(TREATMENT_CHART_HEIGHT / 2);

  // Draw faint center line across left section only
  for (let x = CHART_X; x < CHART_X + CHART_LEFT_WIDTH; x++) {
    setPixel(frame, x, centerY, TREATMENT_COLORS.centerLine);
  }

  const halfHeight = Math.floor(TREATMENT_CHART_HEIGHT / 2) - 1;
  const timeRange = 21 * HOUR_MS;

  // Render left section bars
  for (const treatment of leftTreatments) {
    const timeOffset = treatment.timestamp - leftStartTime;
    const barX = CHART_X + Math.round((timeOffset / timeRange) * (CHART_LEFT_WIDTH - 1));

    if (barX >= CHART_X && barX < CHART_X + CHART_LEFT_WIDTH) {
      if (treatment.type === "insulin") {
        const barHeight = Math.max(1, Math.round((treatment.value / maxInsulin) * halfHeight));
        for (let dy = 0; dy < barHeight; dy++) {
          const py = centerY + 1 + dy;
          if (py < TREATMENT_CHART_Y + TREATMENT_CHART_HEIGHT) {
            setPixel(frame, barX, py, TREATMENT_COLORS.insulin);
          }
        }
      } else {
        const barHeight = Math.max(1, Math.round((treatment.value / maxCarbs) * halfHeight));
        for (let dy = 0; dy < barHeight; dy++) {
          const py = centerY - 1 - dy;
          if (py >= TREATMENT_CHART_Y) {
            setPixel(frame, barX, py, TREATMENT_COLORS.carbs);
          }
        }
      }
    }
  }

  // Right section: 3-day insulin comparison (same 21h window)
  // Period 1: 72-51h ago (3 days back)
  // Period 2: 48-27h ago (2 days back)
  // Period 3: 24-3h ago (current, same as left chart)
  const period3 = calculateInsulinTotal(treatmentList, now - 24 * HOUR_MS, now - 3 * HOUR_MS);
  const period2 = calculateInsulinTotal(treatmentList, now - 48 * HOUR_MS, now - 27 * HOUR_MS);
  const period1 = calculateInsulinTotal(treatmentList, now - 72 * HOUR_MS, now - 51 * HOUR_MS);

  // Display as 3 numbers horizontally with brightness indicating recency
  // Oldest (dimmest) -> newest (brightest)
  const rightX = CHART_X + CHART_LEFT_WIDTH + 1;
  const textY = TREATMENT_CHART_Y + 3; // Center vertically in chart area

  // Format numbers (round to integers)
  const p1Str = String(Math.round(period1));
  const p2Str = String(Math.round(period2));
  const p3Str = String(Math.round(period3));

  // Colors: dim -> medium -> bright blue
  const dimBlue: RGB = { r: 40, g: 60, b: 100 };
  const medBlue: RGB = { r: 70, g: 100, b: 160 };
  const brightBlue: RGB = { r: 100, g: 150, b: 255 };

  // Draw the 3 numbers with spacing
  let textX = rightX;
  drawTinyText(frame, p1Str, textX, textY, dimBlue);
  textX += measureTinyText(p1Str) + 2;
  drawTinyText(frame, p2Str, textX, textY, medBlue);
  textX += measureTinyText(p2Str) + 2;
  drawTinyText(frame, p3Str, textX, textY, brightBlue);
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

  // Treatment chart (insulin/carbs bar chart)
  if (treatments && treatments.treatments.length > 0 && !treatments.isStale) {
    renderTreatmentChart(frame, treatments);
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
