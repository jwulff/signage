/**
 * Blood sugar region renderer
 */

import type { Frame, RGB } from "@signage/core";
import { setPixel } from "@signage/core";
import { drawText, drawTinyText, measureText, DISPLAY_WIDTH } from "./text.js";
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
const CHART_HOURS = 3; // Timeframe shown in chart

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
    0b0000010,
    0b0000001,
    0b1111111,
    0b0000001,
    0b0000010,
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
  history?: BloodSugarHistory
): void {
  if (!data) {
    const errText = "BG ERR";
    drawText(frame, errText, centerXWithMargin(errText), TEXT_ROW, COLORS.urgentLow, BG_REGION_START, BG_REGION_END);
    return;
  }

  const { glucose, trend, delta, timestamp, rangeStatus, isStale } = data;
  const valueColor = isStale ? COLORS.stale : COLORS[rangeStatus];

  // Top: Arrow + reading + delta + time
  // e.g., [→] 194 +8 1m
  const deltaStr = delta >= 0 ? `+${delta}` : String(delta);
  const mins = minutesAgo(timestamp);
  const textPart = `${glucose} ${deltaStr} ${mins}m`;

  // Calculate total width: arrow (7) + space (2) + text
  const textWidth = measureText(textPart);
  const totalWidth = ARROW_WIDTH + 2 + textWidth;

  // Center, but ensure margins on both sides
  const maxStartX = DISPLAY_WIDTH - totalWidth - TEXT_MARGIN;
  const centered = Math.floor((DISPLAY_WIDTH - totalWidth) / 2);
  const startX = Math.max(TEXT_MARGIN, Math.min(centered, maxStartX));

  // Draw arrow
  drawTrendArrow(frame, trend, startX, TEXT_ROW, valueColor);

  // Draw text after arrow
  const textX = startX + ARROW_WIDTH + 2;
  drawText(frame, textPart, textX, TEXT_ROW, valueColor, BG_REGION_START, BG_REGION_END);

  // Bottom: Full-width sparkline chart
  if (history && history.points.length > 0) {
    renderChart(frame, history.points, {
      x: CHART_X,
      y: CHART_Y,
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      hours: CHART_HOURS,
    });

    // Tiny legend at bottom left, overlaying chart (very dim)
    const legend = `${CHART_HOURS}h`;
    const legendY = CHART_Y + CHART_HEIGHT - 5; // 5px tiny font, at bottom
    drawTinyText(frame, legend, CHART_X, legendY, COLORS.veryDim);
  }
}

// Re-export ChartPoint for convenience
export type { ChartPoint };
