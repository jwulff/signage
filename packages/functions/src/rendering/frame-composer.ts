/**
 * Frame composer - combines all widgets into a single frame
 *
 * Layout (64x64) - optimized for glucose monitoring:
 * ┌───────────────────────────────────────┐
 * │        SUN FEB 1  2:53                │  rows  1-5  (date/time)
 * │                                       │  row   6    (spacer)
 * │   → 281  +9  0M                       │  rows  7-11 (glucose reading)
 * │                                       │  row  12    (spacer)
 * │     [glucose sparkline chart]         │  rows 13-40 (28px - expanded!)
 * │                                       │  row  41    (spacer)
 * │        16  13  12   4   2   4H        │  rows 42-48 (insulin totals)
 * │                                       │  rows 49-51 (spacer)
 * │     4-HOUR GLUCOSE                    │  rows 52-57 (insight line 1)
 * │     ANALYSIS                          │  rows 58-63 (insight line 2)
 * └───────────────────────────────────────┘
 *
 * Note: Spacer rows are intentionally left blank to provide visual separation
 * between the main sections (time, glucose reading, chart, insulin, insights).
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
import { renderInsightRegion, type InsightDisplayData } from "./insight-renderer.js";

export interface CompositorData {
  bloodSugar: BloodSugarDisplayData | null;
  bloodSugarHistory?: BloodSugarHistory;
  timezone?: string;
  weather?: ClockWeatherData;
  treatments?: TreatmentDisplayData | null;
  insight?: InsightDisplayData | null;
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

  // Render insight overlay (replaces weather band area when insight available)
  if (data.insight) {
    if (!safeRender("insight", () => renderInsightRegion(frame, data.insight ?? null))) {
      errors.push("insight");
    }
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
