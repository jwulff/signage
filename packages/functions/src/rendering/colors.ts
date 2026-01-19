/**
 * Shared color definitions for display rendering
 */

import type { RGB } from "@signage/core";

export const COLORS = {
  // Clock colors
  clockHeader: { r: 0, g: 200, b: 255 } as RGB,
  clockTime: { r: 255, g: 255, b: 255 } as RGB,
  clockAmPm: { r: 100, g: 100, b: 100 } as RGB,

  // Blood sugar colors by range
  urgentLow: { r: 255, g: 0, b: 0 } as RGB,
  low: { r: 255, g: 165, b: 0 } as RGB,
  normal: { r: 0, g: 255, b: 0 } as RGB,
  high: { r: 255, g: 255, b: 0 } as RGB,
  veryHigh: { r: 255, g: 0, b: 0 } as RGB,
  stale: { r: 128, g: 128, b: 128 } as RGB,
  delta: { r: 100, g: 100, b: 100 } as RGB,

  // Readiness score colors
  readinessOptimal: { r: 0, g: 255, b: 0 } as RGB,      // 85-100: Green
  readinessGood: { r: 128, g: 255, b: 0 } as RGB,       // 70-84: Yellow-green
  readinessFair: { r: 255, g: 255, b: 0 } as RGB,       // 60-69: Yellow
  readinessLow: { r: 255, g: 128, b: 0 } as RGB,        // 50-59: Orange
  readinessPoor: { r: 255, g: 0, b: 0 } as RGB,         // <50: Red
  readinessStale: { r: 128, g: 128, b: 128 } as RGB,    // No data: Gray
  readinessInitial: { r: 100, g: 100, b: 100 } as RGB,  // Initial letter: Dim gray

  // Background
  bg: { r: 0, g: 0, b: 0 } as RGB,
  separator: { r: 40, g: 40, b: 40 } as RGB,

  // Very dim for subtle overlays
  veryDim: { r: 35, g: 35, b: 35 } as RGB,
} as const;

export type RangeStatus = "urgentLow" | "low" | "normal" | "high" | "veryHigh";

/**
 * Get color for a readiness score
 */
export function getReadinessColor(score: number | null): RGB {
  if (score === null) return COLORS.readinessStale;
  if (score >= 85) return COLORS.readinessOptimal;
  if (score >= 70) return COLORS.readinessGood;
  if (score >= 60) return COLORS.readinessFair;
  if (score >= 50) return COLORS.readinessLow;
  return COLORS.readinessPoor;
}
