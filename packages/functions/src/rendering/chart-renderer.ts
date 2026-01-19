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
const TARGET_CENTER = 120; // Sweet spot - pure green here

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Interpolate between two colors
 */
function lerpColor(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } {
  return {
    r: lerp(c1.r, c2.r, t),
    g: lerp(c1.g, c2.g, t),
    b: lerp(c1.b, c2.b, t),
  };
}

/**
 * Get color for a glucose value with gradient in normal range
 */
function getGlucoseColor(glucose: number): { r: number; g: number; b: number } {
  if (glucose < 55) return COLORS.urgentLow;
  if (glucose < TARGET_LOW) return COLORS.low;
  if (glucose > 250) return COLORS.veryHigh;
  if (glucose > TARGET_HIGH) return COLORS.high;

  // Normal range (70-180) with gradient toward edges
  if (glucose <= TARGET_CENTER) {
    // 70-120: blend from orange-tinted to pure green
    // t=0 at 70 (70% toward orange), t=1 at 120 (pure green)
    const t = (glucose - TARGET_LOW) / (TARGET_CENTER - TARGET_LOW);
    return lerpColor(
      lerpColor(COLORS.low, COLORS.normal, 0.3), // 70% orange, 30% green at edge
      COLORS.normal,
      t
    );
  } else {
    // 120-180: blend from pure green to yellow-tinted
    // t=0 at 120 (pure green), t=1 at 180 (70% toward yellow)
    const t = (glucose - TARGET_CENTER) / (TARGET_HIGH - TARGET_CENTER);
    return lerpColor(
      COLORS.normal,
      lerpColor(COLORS.normal, COLORS.high, 0.7), // 30% green, 70% yellow at edge
      t
    );
  }
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

  // Target range background removed - the line color gradient provides
  // sufficient visual indication of range status

  // Helper to convert Y pixel position to glucose value
  const yToGlucose = (py: number): number => {
    const normalizedY = (y + height - 1 - py) / (height - 1);
    return minGlucose + normalizedY * glucoseRange;
  };

  // Draw the line chart
  let prevPixelX: number | null = null;
  let prevPixelY: number | null = null;

  for (const point of visiblePoints) {
    // Calculate pixel position
    const timeOffset = point.timestamp - startTime;
    const pixelX = x + Math.round((timeOffset / timeRange) * (width - 1));

    const clampedGlucose = Math.max(minGlucose, Math.min(maxGlucose, point.glucose));
    const glucoseOffset = clampedGlucose - minGlucose;
    const pixelY = y + height - 1 - Math.round((glucoseOffset / glucoseRange) * (height - 1));

    // Draw point with color based on its Y position
    if (pixelX >= x && pixelX < x + width && pixelY >= y && pixelY < y + height) {
      const color = getGlucoseColor(yToGlucose(pixelY));
      setPixel(frame, pixelX, pixelY, color);

      // Connect to previous point with a line (color determined per-pixel by Y position)
      if (prevPixelX !== null && prevPixelY !== null) {
        drawLine(frame, prevPixelX, prevPixelY, pixelX, pixelY, yToGlucose, x, y, width, height);
      }
    }

    prevPixelX = pixelX;
    prevPixelY = pixelY;
  }
}

/**
 * Draw a line between two points using Bresenham's algorithm
 * Color is determined per-pixel based on Y position (glucose level)
 */
function drawLine(
  frame: Frame,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  yToGlucose: (y: number) => number,
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

  let currentX = x0;
  let currentY = y0;

  while (true) {
    // Only draw if within clip bounds
    if (currentX >= clipX && currentX < clipX + clipWidth && currentY >= clipY && currentY < clipY + clipHeight) {
      // Color based on Y position (glucose level at this pixel)
      const glucose = yToGlucose(currentY);
      const color = getGlucoseColor(glucose);
      setPixel(frame, currentX, currentY, color);
    }

    if (currentX === x1 && currentY === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      currentX += sx;
    }
    if (e2 < dx) {
      err += dx;
      currentY += sy;
    }
  }
}
