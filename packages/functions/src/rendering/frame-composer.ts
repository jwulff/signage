/**
 * Frame composer - combines all widgets into a single frame
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

export interface CompositorData {
  bloodSugar: BloodSugarDisplayData | null;
  bloodSugarHistory?: BloodSugarHistory;
  timezone?: string;
  weather?: ClockWeatherData;
}

/**
 * Generate the composite frame with all widgets
 */
export function generateCompositeFrame(data: CompositorData): Frame {
  const frame = createSolidFrame(DISPLAY_WIDTH, DISPLAY_HEIGHT, COLORS.bg);

  // Render clock in top region (with optional weather data)
  renderClockRegion(frame, data.timezone, data.weather);

  // Render blood sugar in bottom region (with optional history chart)
  renderBloodSugarRegion(frame, data.bloodSugar, data.bloodSugarHistory, data.timezone);

  return frame;
}

export { DISPLAY_WIDTH, DISPLAY_HEIGHT };
