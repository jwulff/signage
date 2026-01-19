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
 * Generate the composite frame with all widgets
 */
export function generateCompositeFrame(data: CompositorData): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, COLORS.bg);

  // Render clock (full width) - includes time, date, and weather band
  renderClockRegion(frame, data.timezone, data.weather);

  // Render readiness scores horizontally below weather band (if available)
  if (data.readiness && data.readiness.length > 0) {
    renderReadinessRegion(frame, data.readiness);
  }

  // Render blood sugar in bottom region (with optional history chart)
  renderBloodSugarRegion(frame, data.bloodSugar, data.bloodSugarHistory, data.timezone);

  return frame;
}

export { DISPLAY_WIDTH, DISPLAY_HEIGHT };
