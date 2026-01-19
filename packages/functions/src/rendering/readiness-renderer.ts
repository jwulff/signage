/**
 * Readiness score renderer
 * Renders Oura readiness scores in a horizontal row below the weather band
 */

import type { Frame } from "@signage/core";
import { drawTinyText, DISPLAY_WIDTH } from "./text.js";
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

// Readiness row position (below weather band)
const READINESS_ROW_Y = 27;

/**
 * Render readiness scores in a horizontal row
 * Format: "J 82  S 75" centered on full width
 */
export function renderReadinessRegion(
  frame: Frame,
  users: ReadinessDisplayData[]
): void {
  if (users.length === 0) return;

  // Build the display strings for each user
  const parts: { text: string; color: { r: number; g: number; b: number } }[] = [];

  for (const user of users) {
    let scoreStr: string;
    let scoreColor = getReadinessColor(user.score);

    if (user.needsReauth) {
      scoreStr = "?";
      scoreColor = COLORS.readinessStale;
    } else if (user.score === null || user.isStale) {
      scoreStr = "--";
      scoreColor = COLORS.readinessStale;
    } else {
      scoreStr = String(user.score);
    }

    // Add initial in dim color
    parts.push({ text: user.initial, color: COLORS.readinessInitial });
    // Add score in appropriate color
    parts.push({ text: scoreStr, color: scoreColor });
  }

  // Calculate total width: each part is (chars * 4 - 1) px, with 2px gaps between parts
  // "J" "82" "  " "S" "75" = J(3) + space(2) + 82(7) + gap(4) + S(3) + space(2) + 75(7) = 28px
  let totalWidth = 0;
  for (let i = 0; i < parts.length; i++) {
    totalWidth += parts[i].text.length * 4 - 1;
    if (i < parts.length - 1) {
      // Gap between parts: 2px after initial, 4px between users
      totalWidth += i % 2 === 0 ? 2 : 4;
    }
  }

  // Center horizontally
  let x = Math.floor((DISPLAY_WIDTH - totalWidth) / 2);

  // Draw each part
  for (let i = 0; i < parts.length; i++) {
    drawTinyText(frame, parts[i].text, x, READINESS_ROW_Y, parts[i].color);
    x += parts[i].text.length * 4 - 1;
    if (i < parts.length - 1) {
      x += i % 2 === 0 ? 2 : 4;
    }
  }
}
