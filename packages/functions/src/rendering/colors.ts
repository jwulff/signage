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

  // Background
  bg: { r: 0, g: 0, b: 0 } as RGB,
  separator: { r: 40, g: 40, b: 40 } as RGB,

  // Very dim for subtle overlays
  veryDim: { r: 35, g: 35, b: 35 } as RGB,
} as const;

export type RangeStatus = "urgentLow" | "low" | "normal" | "high" | "veryHigh";
