/**
 * Insight Renderer
 *
 * Renders AI-generated insights on the display.
 * Replaces the weather/sunlight band in the layout.
 */

import type { Frame, RGB } from "@signage/core";
import { drawTinyText } from "./text.js";
import { COLORS } from "./colors.js";

/**
 * Insight display data
 */
export interface InsightDisplayData {
  /** The insight text (max ~80 chars, will be truncated for display) */
  content: string;
  /** Type of insight */
  type: "hourly" | "daily" | "weekly" | "alert";
  /** When the insight was generated (Unix ms) */
  generatedAt: number;
  /** Whether the insight is stale (>2 hours old) */
  isStale: boolean;
  /** Staleness status */
  status: "fresh" | "stale" | "very_stale" | "unavailable";
}

/**
 * Layout constants for insight region
 */
const INSIGHT_REGION_START_Y = 7; // After date row
const TEXT_PADDING_X = 2;

/**
 * Get color for insight based on type and staleness
 */
function getInsightColor(data: InsightDisplayData): RGB {
  // Dim color if stale
  if (data.isStale) {
    return COLORS.stale;
  }

  // Color by type
  switch (data.type) {
    case "alert":
      return COLORS.high; // Yellow for alerts
    case "weekly":
      return COLORS.normal; // Green for weekly summaries
    case "daily":
      return COLORS.clockHeader; // Blue for daily
    case "hourly":
    default:
      return COLORS.clockTime; // White for hourly
  }
}

/**
 * Truncate text to fit display width
 * 3x5 font = 4px per character (3px char + 1px space)
 * Display width = 64px, padding = 2px each side
 * Max chars = (64 - 4) / 4 = 15 chars
 */
function truncateForDisplay(text: string, maxChars: number = 15): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 2) + "..";
}

/**
 * Render insight region on frame
 */
export function renderInsightRegion(
  frame: Frame,
  insight: InsightDisplayData | null
): void {
  const startY = INSIGHT_REGION_START_Y;

  if (!insight || insight.status === "unavailable") {
    // Show "Analyzing..." when no insight available
    drawTinyText(frame, "Analyzing...", TEXT_PADDING_X, startY, COLORS.stale);
    return;
  }

  // Get display color
  const color = getInsightColor(insight);

  // Truncate content for display
  const displayText = truncateForDisplay(insight.content);

  // Draw the insight text
  drawTinyText(frame, displayText, TEXT_PADDING_X, startY, color);
}

/**
 * Get insight staleness status
 */
export function getInsightStatus(
  generatedAt: number | null
): "fresh" | "stale" | "very_stale" | "unavailable" {
  if (generatedAt === null) return "unavailable";

  const ageHours = (Date.now() - generatedAt) / (1000 * 60 * 60);

  if (ageHours <= 2) return "fresh";
  if (ageHours <= 6) return "stale";
  return "very_stale";
}

/**
 * Create insight display data from stored insight
 */
export function createInsightDisplayData(
  content: string | null,
  type: "hourly" | "daily" | "weekly" | "alert" = "hourly",
  generatedAt: number | null = null
): InsightDisplayData | null {
  if (!content || generatedAt === null) {
    return null;
  }

  const status = getInsightStatus(generatedAt);
  const isStale = status === "stale" || status === "very_stale";

  return {
    content,
    type,
    generatedAt,
    isStale,
    status,
  };
}
