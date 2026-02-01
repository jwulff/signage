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
 * Line 1 at Y=11, Line 2 at Y=17 (extends to ~Y=21 with 5px font)
 * Two lines of text, ~15 chars each = ~30 chars total
 */
const INSIGHT_LINE1_Y = 11; // First line (moved up 1px to avoid crowding insulin)
const INSIGHT_LINE2_Y = 17; // Second line (6px spacing for 5px font + 1px gap)
const TEXT_PADDING_X = 2;
// With padding=2 and 4px per char, 15 chars = 60px, fits within 64px display
const MAX_CHARS_PER_LINE = 15;

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
 * Split text into two lines for display
 * 3x5 font = 4px per character (3px char + 1px space)
 * Display width = 64px, padding = 2px each side
 * Max chars per line = 15 chars (with padding)
 * Total = ~30 chars across 2 lines
 */
function splitForDisplay(text: string): [string, string] {
  // Clean up the text - remove markdown, extra spaces
  const cleaned = text
    .replace(/^#+\s*/, "") // Remove markdown headers
    .replace(/\*+/g, "")   // Remove bold/italic markers
    .replace(/\s+/g, " ")  // Normalize whitespace
    .trim();

  if (cleaned.length <= MAX_CHARS_PER_LINE) {
    return [cleaned, ""];
  }

  // Try to split at a word boundary near the end of first line
  const maxTotal = MAX_CHARS_PER_LINE * 2;
  const wasTruncated = cleaned.length > maxTotal;
  const textToSplit = cleaned.slice(0, maxTotal);

  // Find a good split point (space near the end of first line)
  let splitPoint = MAX_CHARS_PER_LINE;
  for (let i = MAX_CHARS_PER_LINE; i >= MAX_CHARS_PER_LINE - 4; i--) {
    if (textToSplit[i] === " ") {
      splitPoint = i;
      break;
    }
  }

  const line1 = textToSplit.slice(0, splitPoint).trim();
  let line2 = textToSplit.slice(splitPoint).trim();

  // Truncate line2 if too long, or add truncation marker if text was cut
  if (line2.length > MAX_CHARS_PER_LINE || wasTruncated) {
    const maxLine2 = wasTruncated ? MAX_CHARS_PER_LINE - 2 : MAX_CHARS_PER_LINE;
    line2 = line2.slice(0, maxLine2 - 2) + "..";
  }

  return [line1, line2];
}

/**
 * Render insight region on frame
 * Shows up to 2 lines of text (~32 chars total)
 */
export function renderInsightRegion(
  frame: Frame,
  insight: InsightDisplayData | null
): void {
  if (!insight || insight.status === "unavailable") {
    // Show "Analyzing..." when no insight available
    drawTinyText(frame, "Analyzing...", TEXT_PADDING_X, INSIGHT_LINE1_Y, COLORS.stale);
    return;
  }

  // Get display color
  const color = getInsightColor(insight);

  // Split content into two lines for display
  const [line1, line2] = splitForDisplay(insight.content);

  // Draw both lines
  drawTinyText(frame, line1, TEXT_PADDING_X, INSIGHT_LINE1_Y, color);
  if (line2) {
    drawTinyText(frame, line2, TEXT_PADDING_X, INSIGHT_LINE2_Y, color);
  }
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
