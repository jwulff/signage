/**
 * Readiness score renderer
 * Renders Oura readiness scores in the top-left 32x32 region
 */

import type { Frame } from "@signage/core";
import { drawText } from "./text.js";
import { COLORS, getReadinessColor } from "./colors.js";

/**
 * Readiness data for a single user
 */
export interface ReadinessDisplayData {
  initial: string;
  score: number | null; // null if no data available
  isStale?: boolean;
  needsReauth?: boolean;
}

// Readiness region boundaries
const READINESS_REGION_START_Y = 0;
const READINESS_REGION_END_Y = 31;

// Layout for 2 users stacked vertically
const USER_1_Y = 4; // First user at row 4
const USER_2_Y = 18; // Second user at row 18 (14px below first)

/**
 * Render a single readiness score row
 * Format: "J 82" where J is the initial and 82 is the score
 */
function renderReadinessRow(
  frame: Frame,
  data: ReadinessDisplayData,
  startY: number
): void {
  const startX = 2; // Small left margin

  // Determine what to display
  let scoreStr: string;
  let scoreColor = getReadinessColor(data.score);

  if (data.needsReauth) {
    scoreStr = "?";
    scoreColor = COLORS.readinessStale;
  } else if (data.score === null || data.isStale) {
    scoreStr = "--";
    scoreColor = COLORS.readinessStale;
  } else {
    scoreStr = String(data.score);
  }

  // Draw initial in dim gray
  drawText(
    frame,
    data.initial,
    startX,
    startY,
    COLORS.readinessInitial,
    READINESS_REGION_START_Y,
    READINESS_REGION_END_Y
  );

  // Draw score after initial (initial is 5px wide + 1px space + 2px gap = 8px offset)
  const scoreX = startX + 8;
  drawText(
    frame,
    scoreStr,
    scoreX,
    startY,
    scoreColor,
    READINESS_REGION_START_Y,
    READINESS_REGION_END_Y
  );
}

/**
 * Render readiness scores in the top-left region
 * Supports up to 2 users stacked vertically
 */
export function renderReadinessRegion(
  frame: Frame,
  users: ReadinessDisplayData[]
): void {
  // Render first user
  if (users.length > 0) {
    renderReadinessRow(frame, users[0], USER_1_Y);
  }

  // Render second user
  if (users.length > 1) {
    renderReadinessRow(frame, users[1], USER_2_Y);
  }
}
