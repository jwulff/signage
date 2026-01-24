/**
 * Treatment data renderer for insulin and carb overlays
 */

import type { Frame, RGB } from "@signage/core";
import { setPixel } from "@signage/core";
import { drawTinyText, DISPLAY_WIDTH } from "./text.js";
import type { TreatmentDisplayData, GlookoTreatment } from "../glooko/types.js";

// Treatment colors
const COLORS = {
  insulin: { r: 100, g: 150, b: 255 } as RGB, // Light blue
  carbs: { r: 255, g: 180, b: 100 } as RGB, // Light orange
  stale: { r: 80, g: 80, b: 80 } as RGB, // Dim gray
} as const;

// Marker bitmaps (5 wide x 4 tall)
// Insulin marker: down triangle (▼) - insulin brings BG down
const INSULIN_MARKER = [
  0b11111, // █████
  0b01110, //  ███
  0b00100, //   █
  0b00000,
];

// Carb marker: up triangle (▲) - carbs bring BG up
const CARB_MARKER = [
  0b00000,
  0b00100, //   █
  0b01110, //  ███
  0b11111, // █████
];

const MARKER_WIDTH = 5;
const MARKER_HEIGHT = 4;

/**
 * Chart bounds for marker positioning
 */
export interface ChartBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Hours of history shown in this chart section */
  hours: number;
  /** Hours offset from now (0 = ends at now) */
  offsetHours?: number;
}

/**
 * Format treatment summary text (e.g., "8.5u 42g")
 */
function formatSummary(insulinUnits: number, carbGrams: number): string {
  const parts: string[] = [];

  if (insulinUnits > 0) {
    // Format insulin: show decimal if not whole number, max 1 decimal place
    const insulinStr =
      insulinUnits % 1 === 0 ? String(insulinUnits) : insulinUnits.toFixed(1);
    parts.push(`${insulinStr}U`);
  }

  if (carbGrams > 0) {
    parts.push(`${Math.round(carbGrams)}G`);
  }

  return parts.join(" ");
}

/**
 * Render treatment summary text in the top-right of the blood sugar region
 * Shows total insulin units and carb grams for the recent period
 *
 * @param frame The frame to render to
 * @param data Treatment display data
 * @param rightEdge X position of the right edge (for alignment)
 * @param y Y position to render at
 */
export function renderTreatmentSummary(
  frame: Frame,
  data: TreatmentDisplayData | null,
  rightEdge: number,
  y: number
): void {
  if (!data) return;

  const { recentInsulinUnits, recentCarbsGrams, isStale } = data;

  // Don't render if no treatments
  if (recentInsulinUnits === 0 && recentCarbsGrams === 0) return;

  const color = isStale ? COLORS.stale : COLORS.insulin;
  const text = formatSummary(recentInsulinUnits, recentCarbsGrams);

  // Calculate width of tiny text (4px per char including spacing)
  const textWidth = text.length * 4;

  // Position at right edge with margin
  const x = rightEdge - textWidth - 1;

  drawTinyText(frame, text, x, y, color);
}

/**
 * Draw a marker at the specified position
 */
function drawMarker(
  frame: Frame,
  bitmap: number[],
  x: number,
  y: number,
  color: RGB,
  clipY: number,
  clipHeight: number
): void {
  for (let row = 0; row < MARKER_HEIGHT; row++) {
    for (let col = 0; col < MARKER_WIDTH; col++) {
      const bit = (bitmap[row] >> (MARKER_WIDTH - 1 - col)) & 1;
      if (bit) {
        const px = x + col;
        const py = y + row;
        // Clip to chart bounds
        if (px >= 0 && px < DISPLAY_WIDTH && py >= clipY && py < clipY + clipHeight) {
          setPixel(frame, px, py, color);
        }
      }
    }
  }
}

/**
 * Render treatment markers on the chart
 * Insulin markers (▼) appear at the top of the chart
 * Carb markers (▲) appear at the bottom of the chart
 *
 * @param frame The frame to render to
 * @param treatments Array of treatments to render
 * @param bounds Chart bounds for positioning
 */
export function renderTreatmentMarkers(
  frame: Frame,
  treatments: GlookoTreatment[],
  bounds: ChartBounds
): void {
  if (!treatments || treatments.length === 0) return;

  const { x, y, width, height, hours, offsetHours = 0 } = bounds;

  const now = Date.now();
  const endTime = now - offsetHours * 60 * 60 * 1000;
  const startTime = endTime - hours * 60 * 60 * 1000;
  const timeRange = hours * 60 * 60 * 1000;

  // Filter treatments to visible time range
  const visibleTreatments = treatments.filter(
    (t) => t.timestamp >= startTime && t.timestamp <= endTime
  );

  for (const treatment of visibleTreatments) {
    // Calculate X position based on timestamp
    const timeOffset = treatment.timestamp - startTime;
    const markerX = x + Math.round((timeOffset / timeRange) * (width - 1));

    // Center the marker on the X position
    const centeredX = markerX - Math.floor(MARKER_WIDTH / 2);

    if (centeredX >= x - MARKER_WIDTH && centeredX < x + width) {
      if (treatment.type === "insulin") {
        // Insulin markers at top of chart
        drawMarker(
          frame,
          INSULIN_MARKER,
          centeredX,
          y,
          COLORS.insulin,
          y,
          height
        );
      } else {
        // Carb markers at bottom of chart
        drawMarker(
          frame,
          CARB_MARKER,
          centeredX,
          y + height - MARKER_HEIGHT,
          COLORS.carbs,
          y,
          height
        );
      }
    }
  }
}

/**
 * Calculate treatment totals for a time window
 *
 * @param treatments Array of all treatments
 * @param windowHours Number of hours to sum (from now)
 * @returns Totals for insulin and carbs
 */
export function calculateTreatmentTotals(
  treatments: GlookoTreatment[],
  windowHours: number
): { insulinUnits: number; carbGrams: number } {
  const now = Date.now();
  const cutoff = now - windowHours * 60 * 60 * 1000;

  let insulinUnits = 0;
  let carbGrams = 0;

  for (const treatment of treatments) {
    if (treatment.timestamp >= cutoff) {
      if (treatment.type === "insulin") {
        insulinUnits += treatment.value;
      } else {
        carbGrams += treatment.value;
      }
    }
  }

  return {
    insulinUnits: Math.round(insulinUnits * 10) / 10, // Round to 1 decimal
    carbGrams: Math.round(carbGrams),
  };
}
