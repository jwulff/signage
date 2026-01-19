/**
 * Frame composer - combines all widgets into a single frame
 *
 * Layout (64x64):
 * ┌───────────────────┬───────────────────┐
 * │ J  82             │                   │  rows 0-31
 * │ S  75             │    10:45          │
 * │ (readiness)       │    (clock)        │
 * ├───────────────────┴───────────────────┤
 * │                                       │  rows 32-63
 * │           GLUCOSE (unchanged)         │
 * │                                       │
 * └───────────────────────────────────────┘
 *      cols 0-31            cols 32-63
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

  // Check if we have readiness data to display
  const hasReadiness = data.readiness && data.readiness.length > 0;

  if (hasReadiness) {
    // New layout with readiness scores

    // Render readiness in top-left region (cols 0-31, rows 0-31)
    renderReadinessRegion(frame, data.readiness!);

    // Render clock in top-right region (cols 32-63, rows 0-31)
    renderClockRegion(frame, data.timezone, data.weather, {
      startX: 32,
      endX: 63,
      startY: 0,
      endY: 31,
    });
  } else {
    // Original layout without readiness - clock takes full top region
    renderClockRegion(frame, data.timezone, data.weather);
  }

  // Render blood sugar in bottom region (with optional history chart)
  renderBloodSugarRegion(frame, data.bloodSugar, data.bloodSugarHistory, data.timezone);

  return frame;
}

export { DISPLAY_WIDTH, DISPLAY_HEIGHT };
