/**
 * ASCII renderer for debugging frame output
 * Converts a Frame to ASCII art for terminal/text visualization
 */

import type { Frame } from "@signage/core";

/**
 * Get pixel data from frame (handles Frame object structure)
 */
function getPixels(frame: Frame): Uint8Array {
  // Frame is { width, height, pixels } object
  return (frame as { pixels: Uint8Array }).pixels;
}

/**
 * Convert a frame to ASCII art
 * Uses different characters based on pixel brightness/color
 */
export function frameToAscii(frame: Frame, options?: { width?: number; height?: number }): string {
  const width = options?.width ?? 64;
  const height = options?.height ?? 64;
  const pixels = getPixels(frame);
  const lines: string[] = [];

  // Top border
  lines.push("┌" + "─".repeat(width) + "┐");

  for (let y = 0; y < height; y++) {
    let line = "│";
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = pixels[idx] ?? 0;
      const g = pixels[idx + 1] ?? 0;
      const b = pixels[idx + 2] ?? 0;

      // Calculate brightness
      const brightness = (r + g + b) / 3;

      // Determine character based on color and brightness
      const char = getCharForPixel(r, g, b, brightness);
      line += char;
    }
    line += "│";
    lines.push(line);
  }

  // Bottom border
  lines.push("└" + "─".repeat(width) + "┘");

  return lines.join("\n");
}

/**
 * Get ASCII character for a pixel based on its color
 */
function getCharForPixel(r: number, g: number, b: number, brightness: number): string {
  // Black/off pixel
  if (brightness < 5) return " ";

  // Very dim (like the legend or separator)
  if (brightness < 50) return "·";

  // Determine dominant color
  const max = Math.max(r, g, b);

  if (max === r && r > g + 30 && r > b + 30) {
    // Red dominant (urgent low, very high)
    return brightness > 150 ? "█" : "▓";
  }

  if (max === g && g > r + 30 && g > b + 30) {
    // Green dominant (normal range)
    return brightness > 150 ? "█" : "▓";
  }

  if (max === b && b > r + 30 && b > g + 30) {
    // Blue dominant (clock header)
    return brightness > 150 ? "█" : "▓";
  }

  if (r > 200 && g > 200 && b < 100) {
    // Yellow (high range)
    return brightness > 150 ? "█" : "▓";
  }

  if (r > 200 && g > 100 && g < 200 && b < 100) {
    // Orange (low range)
    return brightness > 150 ? "█" : "▓";
  }

  // White or gray
  if (brightness > 200) return "█";
  if (brightness > 150) return "▓";
  if (brightness > 100) return "▒";
  return "░";
}

/**
 * Render a frame to ASCII with color indicators
 * Shows a legend and more detail about what's displayed
 */
export function frameToAsciiDetailed(frame: Frame, options?: { width?: number; height?: number }): string {
  const width = options?.width ?? 64;
  const height = options?.height ?? 64;
  const pixels = getPixels(frame);
  const lines: string[] = [];

  lines.push("=".repeat(width + 4));
  lines.push("  FRAME DEBUG OUTPUT");
  lines.push("=".repeat(width + 4));
  lines.push("");

  // Top border with column markers every 10
  let colMarker = "  ";
  for (let x = 0; x < width; x++) {
    colMarker += x % 10 === 0 ? (x / 10).toString() : " ";
  }
  lines.push(colMarker);

  lines.push("  ┌" + "─".repeat(width) + "┐");

  for (let y = 0; y < height; y++) {
    // Row marker
    const rowMarker = y.toString().padStart(2, " ");
    let line = rowMarker + "│";

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = pixels[idx] ?? 0;
      const g = pixels[idx + 1] ?? 0;
      const b = pixels[idx + 2] ?? 0;
      const brightness = (r + g + b) / 3;

      line += getCharForPixel(r, g, b, brightness);
    }
    line += "│";
    lines.push(line);
  }

  lines.push("  └" + "─".repeat(width) + "┘");
  lines.push("");
  lines.push("Legend: █=bright ▓=medium ▒=dim ░=faint ·=very dim (space)=off");
  lines.push("");

  return lines.join("\n");
}

/**
 * Simple compact ASCII output using just basic characters
 * Good for quick debugging in logs
 */
export function frameToSimpleAscii(frame: Frame, options?: { width?: number; height?: number }): string {
  const width = options?.width ?? 64;
  const height = options?.height ?? 64;
  const pixels = getPixels(frame);
  const lines: string[] = [];

  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = pixels[idx] ?? 0;
      const g = pixels[idx + 1] ?? 0;
      const b = pixels[idx + 2] ?? 0;
      const brightness = (r + g + b) / 3;

      if (brightness < 5) line += " ";
      else if (brightness < 50) line += ".";
      else if (brightness < 100) line += "+";
      else if (brightness < 150) line += "*";
      else if (brightness < 200) line += "#";
      else line += "@";
    }
    lines.push(line);
  }

  return lines.join("\n");
}
