/**
 * Text utilities for word wrapping and truncation
 * Designed for 64x64 pixel displays with 5x7 bitmap font
 */

/**
 * Wrap text to fit within a maximum character width
 * Splits on word boundaries when possible, breaks long words when necessary
 */
export function wrapText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [""];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    // Handle words longer than maxChars by breaking them
    if (word.length > maxChars) {
      // First, push current line if not empty
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      // Break the long word into chunks
      for (let i = 0; i < word.length; i += maxChars) {
        const chunk = word.slice(i, i + maxChars);
        if (chunk.length === maxChars) {
          lines.push(chunk);
        } else {
          currentLine = chunk;
        }
      }
      continue;
    }

    // Check if word fits on current line
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      // Word doesn't fit, start new line
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  // Don't forget the last line
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * Truncate text with ellipsis if it exceeds max length
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= 3) {
    return "...".slice(0, maxChars);
  }

  return text.slice(0, maxChars - 3) + "...";
}
