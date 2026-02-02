/**
 * Shared color definitions for display rendering
 */

import type { RGB } from "@signage/core";

export const COLORS = {
  // Clock colors
  clockHeader: { r: 0, g: 200, b: 255 } as RGB,
  clockTime: { r: 255, g: 255, b: 255 } as RGB,
  clockSecondary: { r: 100, g: 100, b: 100 } as RGB, // Date, AM/PM, and other secondary text

  // Blood sugar colors by range
  urgentLow: { r: 255, g: 0, b: 0 } as RGB,
  low: { r: 255, g: 165, b: 0 } as RGB,
  normal: { r: 0, g: 255, b: 0 } as RGB,
  high: { r: 255, g: 255, b: 0 } as RGB,
  veryHigh: { r: 255, g: 0, b: 0 } as RGB,
  stale: { r: 128, g: 128, b: 128 } as RGB,
  delta: { r: 100, g: 100, b: 100 } as RGB,

  // Update timestamp color (off-white, less eye-catching)
  updateTime: { r: 140, g: 140, b: 140 } as RGB,

  // Readiness score colors
  readinessOptimal: { r: 0, g: 255, b: 0 } as RGB,      // 85-100: Green
  readinessGood: { r: 128, g: 255, b: 0 } as RGB,       // 70-84: Yellow-green
  readinessFair: { r: 255, g: 255, b: 0 } as RGB,       // 60-69: Yellow
  readinessLow: { r: 255, g: 128, b: 0 } as RGB,        // 50-59: Orange
  readinessPoor: { r: 255, g: 0, b: 0 } as RGB,         // <50: Red
  readinessStale: { r: 128, g: 128, b: 128 } as RGB,    // No data: Gray
  readinessInitial: { r: 100, g: 100, b: 100 } as RGB,  // Initial letter: Dim gray

  // Insulin type colors (for bolus/basal ratio bars)
  insulinBolus: { r: 200, g: 180, b: 220 } as RGB,  // Light purple/lavender
  insulinBasal: { r: 140, g: 90, b: 140 } as RGB,   // Darker purple/magenta

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

/**
 * Get color for a sleep score (uses same ranges as readiness)
 */
export function getSleepColor(score: number | null): RGB {
  if (score === null) return COLORS.readinessStale;
  if (score >= 85) return COLORS.readinessOptimal;
  if (score >= 70) return COLORS.readinessGood;
  if (score >= 60) return COLORS.readinessFair;
  if (score >= 50) return COLORS.readinessLow;
  return COLORS.readinessPoor;
}

/**
 * Get trend-tinted color for glucose delta display.
 * Blends the reading color with red (upward trend) or blue (downward trend)
 * to visually indicate direction at a glance.
 *
 * @param baseColor - The glucose reading color (based on range)
 * @param trend - The trend direction string
 * @returns A color that hints at the trend direction
 */
export function getTrendTintedColor(baseColor: RGB, trend: string): RGB {
  const t = trend.toLowerCase();

  // Upward trends: blend toward red (danger signal)
  if (t === "doubleup" || t === "singleup" || t === "fortyfiveup") {
    const intensity = t === "doubleup" ? 0.5 : t === "singleup" ? 0.35 : 0.2;
    return {
      r: Math.min(255, Math.round(baseColor.r + (255 - baseColor.r) * intensity)),
      g: Math.round(baseColor.g * (1 - intensity * 0.6)),
      b: Math.round(baseColor.b * (1 - intensity * 0.8)),
    };
  }

  // Downward trends: blend toward blue (cooling/safer signal)
  if (t === "doubledown" || t === "singledown" || t === "fortyfivedown") {
    const intensity = t === "doubledown" ? 0.5 : t === "singledown" ? 0.35 : 0.2;
    return {
      r: Math.round(baseColor.r * (1 - intensity * 0.6)),
      g: Math.round(baseColor.g * (1 - intensity * 0.3)),
      b: Math.min(255, Math.round(baseColor.b + (255 - baseColor.b) * intensity * 0.5)),
    };
  }

  // Flat trend: use a slightly dimmed version of the base color
  return {
    r: Math.round(baseColor.r * 0.7),
    g: Math.round(baseColor.g * 0.7),
    b: Math.round(baseColor.b * 0.7),
  };
}
