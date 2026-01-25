/**
 * Frame composer - combines all widgets into a single frame
 *
 * Layout (64x64) - 4 equally-spaced sections above sparkline:
 * ┌───────────────────────────────────────┐
 * │        SUN JAN 19 10:45               │  rows 3-7
 * │                                       │  gap
 * │      [weather/sunlight band]          │  rows 12-19
 * │                                       │  gap
 * │        12  24  36  48  5m             │  rows 23-27 (insulin totals)
 * │                                       │  gap
 * │  → 142 +5 2m                          │  rows 32-36 (glucose reading)
 * │                                       │  gap
 * │     [glucose sparkline chart]         │  rows 40-62 (23px)
 * └───────────────────────────────────────┘
 */

import type { Frame } from "@signage/core";
import { createSolidFrame } from "@signage/core";
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from "./text.js";
import { COLORS } from "./colors.js";
import { renderClockRegion, type ClockWeatherData } from "./clock-renderer.js";
import {
  renderBloodSugarRegion,
  type BloodSugarDisplayData,
  type BloodSugarHistory,
} from "./blood-sugar-renderer.js";
import type { TreatmentDisplayData } from "../glooko/types.js";

export interface CompositorData {
  bloodSugar: BloodSugarDisplayData | null;
  bloodSugarHistory?: BloodSugarHistory;
  timezone?: string;
  weather?: ClockWeatherData;
  treatments?: TreatmentDisplayData | null;
}

/**
 * Safely render a widget, catching and logging any errors.
 * Returns true if rendering succeeded, false if it failed.
 */
function safeRender(widgetName: string, renderFn: () => void): boolean {
  try {
    renderFn();
    return true;
  } catch (error) {
    console.error(`[${widgetName}] Render failed:`, error);
    return false;
  }
}

/**
 * Generate the composite frame with all widgets
 * Uses graceful degradation - if one widget fails, others continue rendering
 */
export function generateCompositeFrame(data: CompositorData): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, COLORS.bg);
  const errors: string[] = [];

  // Render clock (full width) - includes time, date, and weather band
  if (!safeRender("clock", () => renderClockRegion(frame, data.timezone, data.weather))) {
    errors.push("clock");
  }

  // Render blood sugar in bottom region (with treatment chart and glucose chart)
  if (!safeRender("bloodSugar", () => renderBloodSugarRegion(frame, data.bloodSugar, data.bloodSugarHistory, data.timezone, data.treatments))) {
    errors.push("bloodSugar");
  }

  if (errors.length > 0) {
    console.warn(`Frame rendered with ${errors.length} widget error(s): ${errors.join(", ")}`);
  }

  return frame;
}

export { DISPLAY_WIDTH, DISPLAY_HEIGHT };
