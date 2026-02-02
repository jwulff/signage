/**
 * Insight Renderer
 *
 * Renders AI-generated insights on the display.
 * Replaces the weather/sunlight band in the layout.
 */

import type { Frame, RGB } from "@signage/core";
import { drawTinyText, measureTinyText } from "./text.js";
import { COLORS } from "./colors.js";

/**
 * Named colors for insight markup
 * Usage: [green]text[/] or [rainbow]text[/]
 */
const INSIGHT_COLORS: Record<string, RGB> = {
  green: { r: 0, g: 255, b: 0 },
  red: { r: 255, g: 60, b: 60 },
  yellow: { r: 255, g: 255, b: 0 },
  orange: { r: 255, g: 165, b: 0 },
  blue: { r: 100, g: 180, b: 255 },
  white: { r: 255, g: 255, b: 255 },
  gray: { r: 128, g: 128, b: 128 },
  purple: { r: 200, g: 100, b: 255 },
  pink: { r: 255, g: 150, b: 200 },
  cyan: { r: 0, g: 255, b: 255 },
};

/**
 * Rainbow color cycle for celebratory text
 */
const RAINBOW_COLORS: RGB[] = [
  { r: 255, g: 0, b: 0 },     // Red
  { r: 255, g: 127, b: 0 },   // Orange
  { r: 255, g: 255, b: 0 },   // Yellow
  { r: 0, g: 255, b: 0 },     // Green
  { r: 0, g: 200, b: 255 },   // Cyan
  { r: 100, g: 100, b: 255 }, // Blue
  { r: 200, g: 0, b: 255 },   // Purple
];

/**
 * Parsed segment from color markup
 */
interface ColorSegment {
  text: string;
  color: RGB | "rainbow";
}

/**
 * Parse color markup from insight text
 * Supports: [green]text[/], [red]text[/], [rainbow]text[/], etc.
 */
function parseColorMarkup(text: string, defaultColor: RGB): ColorSegment[] {
  const segments: ColorSegment[] = [];
  const regex = /\[(\w+)\](.*?)\[\/\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add any plain text before this match
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index);
      if (plainText) {
        segments.push({ text: plainText, color: defaultColor });
      }
    }

    const colorName = match[1].toLowerCase();
    const coloredText = match[2];

    if (colorName === "rainbow") {
      segments.push({ text: coloredText, color: "rainbow" });
    } else if (INSIGHT_COLORS[colorName]) {
      segments.push({ text: coloredText, color: INSIGHT_COLORS[colorName] });
    } else {
      // Unknown color, use default
      segments.push({ text: coloredText, color: defaultColor });
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining plain text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      segments.push({ text: remainingText, color: defaultColor });
    }
  }

  // If no markup found, return whole text with default color
  if (segments.length === 0) {
    segments.push({ text, color: defaultColor });
  }

  return segments;
}

/**
 * Draw colored text with markup support
 * Handles [color]text[/] markup and rainbow effects
 */
function drawColoredText(
  frame: Frame,
  text: string,
  startX: number,
  startY: number,
  defaultColor: RGB
): void {
  const segments = parseColorMarkup(text, defaultColor);
  let cursorX = startX;

  for (const segment of segments) {
    if (segment.color === "rainbow") {
      // Draw each character with a different rainbow color
      for (let i = 0; i < segment.text.length; i++) {
        const char = segment.text[i];
        const rainbowColor = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
        drawTinyText(frame, char, cursorX, startY, rainbowColor);
        cursorX += 4; // 3px char + 1px space
      }
    } else {
      drawTinyText(frame, segment.text, cursorX, startY, segment.color);
      cursorX += measureTinyText(segment.text) + 1;
    }
  }
}

/**
 * Strip color markup for length calculations
 */
function stripColorMarkup(text: string): string {
  return text.replace(/\[(\w+)\](.*?)\[\/\]/g, "$2");
}

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
 * Positioned below date/time (rows 7-17)
 * Two lines of text, ~15 chars each = ~30 chars total
 */
const INSIGHT_LINE1_Y = 7;  // First line (row 7)
const INSIGHT_LINE2_Y = 13; // Second line (row 13, 6px spacing for 5px font + 1px gap)
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
 *
 * Preserves color markup when splitting
 */
function splitForDisplay(text: string): [string, string] {
  // Clean up the text - remove markdown, extra spaces (but keep color markup)
  const cleaned = text
    .replace(/^#+\s*/, "") // Remove markdown headers
    .replace(/\*+/g, "")   // Remove bold/italic markers
    .replace(/\s+/g, " ")  // Normalize whitespace
    .trim();

  // For length calculations, strip color markup
  const plainText = stripColorMarkup(cleaned);

  if (plainText.length <= MAX_CHARS_PER_LINE) {
    return [cleaned, ""];
  }

  // For splitting, we need to work with both the marked-up text and plain text
  // Find split point in plain text, then map back to marked-up text
  const maxTotal = MAX_CHARS_PER_LINE * 2;
  const wasTruncated = plainText.length > maxTotal;

  // Find a good split point in plain text (space near end of first line)
  let splitPoint = MAX_CHARS_PER_LINE;
  for (let i = Math.min(MAX_CHARS_PER_LINE, plainText.length - 1); i >= MAX_CHARS_PER_LINE - 4 && i >= 0; i--) {
    if (plainText[i] === " ") {
      splitPoint = i;
      break;
    }
  }

  // Map the split point from plain text position to marked-up text position
  const markedSplitPoint = mapPlainIndexToMarked(cleaned, splitPoint);

  const line1 = cleaned.slice(0, markedSplitPoint).trim();
  let line2 = cleaned.slice(markedSplitPoint).trim();

  // Close any open color tags in line1 and reopen in line2
  const { closedLine1, openedLine2 } = balanceColorTags(line1, line2);

  // Check if line2 is too long (in plain chars)
  const line2Plain = stripColorMarkup(openedLine2);
  if (line2Plain.length > MAX_CHARS_PER_LINE || wasTruncated) {
    // Truncate line2 - need to be careful with markup
    const maxPlainChars = wasTruncated ? MAX_CHARS_PER_LINE - 2 : MAX_CHARS_PER_LINE;
    const truncatedLine2 = truncateWithMarkup(openedLine2, maxPlainChars - 2) + "..";
    return [closedLine1, truncatedLine2];
  }

  return [closedLine1, openedLine2];
}

/**
 * Map a plain text index to the corresponding position in marked-up text
 */
function mapPlainIndexToMarked(markedText: string, plainIndex: number): number {
  let plainPos = 0;
  let markedPos = 0;
  const tagRegex = /\[(\w+)\]|\[\/\]/g;

  while (markedPos < markedText.length && plainPos < plainIndex) {
    // Check if we're at a tag
    tagRegex.lastIndex = markedPos;
    const match = tagRegex.exec(markedText);

    if (match && match.index === markedPos) {
      // Skip over the tag
      markedPos = tagRegex.lastIndex;
    } else {
      // Regular character
      plainPos++;
      markedPos++;
    }
  }

  return markedPos;
}

/**
 * Balance color tags between two lines (close open tags in line1, reopen in line2)
 */
function balanceColorTags(line1: string, line2: string): { closedLine1: string; openedLine2: string } {
  // Find any unclosed color tag in line1
  const openTagRegex = /\[(\w+)\](?!.*\[\/\])/;
  const match = line1.match(openTagRegex);

  if (match) {
    const colorName = match[1];
    // Close the tag in line1 and reopen in line2
    return {
      closedLine1: line1 + "[/]",
      openedLine2: `[${colorName}]` + line2,
    };
  }

  return { closedLine1: line1, openedLine2: line2 };
}

/**
 * Truncate text with markup to a maximum number of plain characters
 */
function truncateWithMarkup(text: string, maxPlainChars: number): string {
  let plainCount = 0;
  let result = "";
  const tagRegex = /\[(\w+)\]|\[\/\]/g;
  let lastIndex = 0;
  let match;
  let openTag: string | null = null;

  while ((match = tagRegex.exec(text)) !== null) {
    // Add plain text before this tag
    const plainBefore = text.slice(lastIndex, match.index);
    const charsToAdd = Math.min(plainBefore.length, maxPlainChars - plainCount);

    if (charsToAdd > 0) {
      result += plainBefore.slice(0, charsToAdd);
      plainCount += charsToAdd;
    }

    if (plainCount >= maxPlainChars) {
      break;
    }

    // Add the tag
    result += match[0];
    if (match[0] === "[/]") {
      openTag = null;
    } else {
      openTag = match[1];
    }

    lastIndex = tagRegex.lastIndex;
  }

  // Add remaining plain text if we haven't hit the limit
  if (plainCount < maxPlainChars && lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    const charsToAdd = Math.min(remaining.length, maxPlainChars - plainCount);
    result += remaining.slice(0, charsToAdd);
  }

  // Close any open tag
  if (openTag) {
    result += "[/]";
  }

  return result;
}

/**
 * Render insight region on frame
 * Shows up to 2 lines of text (~32 chars total)
 * Supports color markup: [green]text[/], [rainbow]text[/], etc.
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

  // Get default display color (used for unmarked text)
  const defaultColor = getInsightColor(insight);

  // Split content into two lines for display (preserves color markup)
  const [line1, line2] = splitForDisplay(insight.content);

  // Draw both lines with color support
  drawColoredText(frame, line1, TEXT_PADDING_X, INSIGHT_LINE1_Y, defaultColor);
  if (line2) {
    drawColoredText(frame, line2, TEXT_PADDING_X, INSIGHT_LINE2_Y, defaultColor);
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
