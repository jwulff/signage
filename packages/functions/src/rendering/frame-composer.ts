/**
 * Frame composer - combines all widgets into a single frame
 *
 * Layout (64x64):
 * ┌───────────────────────────────────────┐
 * │           10:45                       │  row 2
 * │        SUN JAN 19 2026                │  row 11
 * │      [weather/sunlight band]          │  rows 18-25
 * │         J 82    S 75                  │  row 27 (readiness)
 * ├───────────────────────────────────────┤
 * │                                       │  rows 32-63
 * │           GLUCOSE                     │
 * │                                       │
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
import {
  renderReadinessRegion,
  type ReadinessDisplayData,
} from "./readiness-renderer.js";

export interface CompositorData {
  bloodSugar: BloodSugarDisplayData | null;
  bloodSugarHistory?: BloodSugarHistory;
  timezone?: string;
  weather?: ClockWeatherData;
  readiness?: ReadinessDisplayData[];
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

  // Render readiness scores horizontally below weather band (if available)
  if (data.readiness && data.readiness.length > 0) {
    if (!safeRender("readiness", () => renderReadinessRegion(frame, data.readiness!))) {
      errors.push("readiness");
    }
  }

  // Render blood sugar in bottom region (with optional history chart)
  if (!safeRender("bloodSugar", () => renderBloodSugarRegion(frame, data.bloodSugar, data.bloodSugarHistory, data.timezone))) {
    errors.push("bloodSugar");
  }

  if (errors.length > 0) {
    console.warn(`Frame rendered with ${errors.length} widget error(s): ${errors.join(", ")}`);
  }

  return frame;
}

export { DISPLAY_WIDTH, DISPLAY_HEIGHT };
