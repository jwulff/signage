/**
 * Readiness and sleep score renderer
 * Renders Oura scores in a horizontal row below the weather band
 */

import type { Frame } from "@signage/core";
import { drawTinyText, DISPLAY_WIDTH } from "./text.js";
import { COLORS, getReadinessColor, getSleepColor } from "./colors.js";

/**
 * Oura data for a single user
 */
export interface ReadinessDisplayData {
  initial: string;
  score: number | null; // readiness score, null if no data
  sleepScore: number | null; // sleep score, null if no data
  isStale?: boolean;
  needsReauth?: boolean;
}

// Row position (below weather band, compact layout)
const READINESS_ROW_Y = 22;

/**
 * Render Oura scores in a horizontal row
 * Format: "J 75/82" (readiness/sleep) centered on full width
 */
export function renderReadinessRegion(
  frame: Frame,
  users: ReadinessDisplayData[]
): void {
  if (users.length === 0) return;

  // Build the display strings for each user
  const parts: { text: string; color: { r: number; g: number; b: number } }[] = [];

  for (const user of users) {
    // Add initial in dim color
    parts.push({ text: user.initial, color: COLORS.readinessInitial });

    if (user.needsReauth) {
      // Show "?" for users needing re-auth
      parts.push({ text: "?", color: COLORS.readinessStale });
    } else if (user.isStale || (user.score === null && user.sleepScore === null)) {
      // Show "--" for stale or missing data
      parts.push({ text: "--", color: COLORS.readinessStale });
    } else {
      // Show readiness score (or "--" if missing)
      const readinessStr = user.score !== null ? String(user.score) : "--";
      const readinessColor = getReadinessColor(user.score);
      parts.push({ text: readinessStr, color: readinessColor });

      // Add "/" separator in dim color
      parts.push({ text: "/", color: COLORS.readinessInitial });

      // Show sleep score (or "--" if missing)
      const sleepStr = user.sleepScore !== null ? String(user.sleepScore) : "--";
      const sleepColor = getSleepColor(user.sleepScore);
      parts.push({ text: sleepStr, color: sleepColor });
    }
  }

  // Calculate total width
  // Each char is 4px wide (3px char + 1px gap), minus 1px for last char
  // Parts have varying gaps: 2px after initial, 0px around "/", 4px between users
  let totalWidth = 0;
  for (let i = 0; i < parts.length; i++) {
    totalWidth += parts[i].text.length * 4 - 1;
    if (i < parts.length - 1) {
      const currentText = parts[i].text;
      const nextText = parts[i + 1].text;
      // No gap around "/"
      if (currentText === "/" || nextText === "/") {
        totalWidth += 1;
      }
      // 2px gap after initial (single letter that's not "/")
      else if (currentText.length === 1 && currentText !== "/") {
        totalWidth += 2;
      }
      // 4px gap between users (after a score, before next initial)
      else {
        totalWidth += 4;
      }
    }
  }

  // Center horizontally
  let x = Math.floor((DISPLAY_WIDTH - totalWidth) / 2);

  // Draw each part
  for (let i = 0; i < parts.length; i++) {
    drawTinyText(frame, parts[i].text, x, READINESS_ROW_Y, parts[i].color);
    x += parts[i].text.length * 4 - 1;
    if (i < parts.length - 1) {
      const currentText = parts[i].text;
      const nextText = parts[i + 1].text;
      if (currentText === "/" || nextText === "/") {
        x += 1;
      } else if (currentText.length === 1 && currentText !== "/") {
        x += 2;
      } else {
        x += 4;
      }
    }
  }
}
