/**
 * Sparkline chart renderer for blood sugar history
 */

import type { Frame } from "@signage/core";
import { setPixel } from "@signage/core";
import { COLORS } from "./colors.js";

/**
 * A single point for the chart
 */
export interface ChartPoint {
  timestamp: number;
  glucose: number;
}

/**
 * Chart configuration
 */
export interface ChartConfig {
  /** Chart X position */
  x: number;
  /** Chart Y position (top) */
  y: number;
  /** Chart width in pixels */
  width: number;
  /** Chart height in pixels */
  height: number;
  /** Hours of history to show (default: 3) */
  hours?: number;
  /** Padding in mg/dL to add above/below data range (default: 15) */
  padding?: number;
}

// Target range for coloring
const TARGET_LOW = 70;
const TARGET_HIGH = 180;

/**
 * Get color for a glucose value
 */
function getGlucoseColor(glucose: number): { r: number; g: number; b: number } {
  if (glucose < 55) return COLORS.urgentLow;
  if (glucose < 70) return COLORS.low;
  if (glucose <= 180) return COLORS.normal;
  if (glucose <= 250) return COLORS.high;
  return COLORS.veryHigh;
}

/**
 * Render a sparkline chart of blood sugar history
 */
export function renderChart(
  frame: Frame,
  points: ChartPoint[],
  config: ChartConfig
): void {
  const {
    x,
    y,
    width,
    height,
    hours = 3,
    padding = 15,
  } = config;

  if (points.length === 0) return;

  const now = Date.now();
  const startTime = now - hours * 60 * 60 * 1000;
  const timeRange = hours * 60 * 60 * 1000;

  // Filter points to the time range
  const visiblePoints = points.filter((p) => p.timestamp >= startTime);

  if (visiblePoints.length === 0) return;

  // Sort by timestamp
  visiblePoints.sort((a, b) => a.timestamp - b.timestamp);

  // Calculate adaptive range from actual data
  const glucoseValues = visiblePoints.map((p) => p.glucose);
  const dataMin = Math.min(...glucoseValues);
  const dataMax = Math.max(...glucoseValues);

  // Add padding, ensuring minimum range of 30 mg/dL for visibility
  const minRange = 30;
  const rawRange = dataMax - dataMin;
  const extraPadding = rawRange < minRange ? (minRange - rawRange) / 2 : 0;

  const minGlucose = Math.max(40, dataMin - padding - extraPadding);
  const maxGlucose = Math.min(400, dataMax + padding + extraPadding);
  const glucoseRange = maxGlucose - minGlucose;

  // Draw target range background (very dim green) - adaptive to visible range
  const targetLowY = y + height - 1 - Math.round(((Math.max(TARGET_LOW, minGlucose) - minGlucose) / glucoseRange) * (height - 1));
  const targetHighY = y + height - 1 - Math.round(((Math.min(TARGET_HIGH, maxGlucose) - minGlucose) / glucoseRange) * (height - 1));

  for (let py = Math.max(y, targetHighY); py <= Math.min(y + height - 1, targetLowY); py++) {
    for (let px = x; px < x + width; px++) {
      setPixel(frame, px, py, { r: 0, g: 15, b: 0 });
    }
  }

  // Draw the line chart
  let prevPixelX: number | null = null;
  let prevPixelY: number | null = null;
  let prevGlucose: number | null = null;

  for (const point of visiblePoints) {
    // Calculate pixel position
    const timeOffset = point.timestamp - startTime;
    const pixelX = x + Math.round((timeOffset / timeRange) * (width - 1));

    const clampedGlucose = Math.max(minGlucose, Math.min(maxGlucose, point.glucose));
    const glucoseOffset = clampedGlucose - minGlucose;
    const pixelY = y + height - 1 - Math.round((glucoseOffset / glucoseRange) * (height - 1));

    const color = getGlucoseColor(point.glucose);

    // Draw point
    if (pixelX >= x && pixelX < x + width && pixelY >= y && pixelY < y + height) {
      setPixel(frame, pixelX, pixelY, color);

      // Connect to previous point with a line
      // Use color of the higher glucose value (more cautious - highlights highs/lows)
      if (prevPixelX !== null && prevPixelY !== null && prevGlucose !== null) {
        const lineColor = point.glucose > prevGlucose
          ? color
          : getGlucoseColor(prevGlucose);
        drawLine(frame, prevPixelX, prevPixelY, pixelX, pixelY, lineColor, x, y, width, height);
      }
    }

    prevPixelX = pixelX;
    prevPixelY = pixelY;
    prevGlucose = point.glucose;
  }
}

/**
 * Draw a line between two points using Bresenham's algorithm
 */
function drawLine(
  frame: Frame,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: { r: number; g: number; b: number },
  clipX: number,
  clipY: number,
  clipWidth: number,
  clipHeight: number
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    // Only draw if within clip bounds
    if (x >= clipX && x < clipX + clipWidth && y >= clipY && y < clipY + clipHeight) {
      setPixel(frame, x, y, color);
    }

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
