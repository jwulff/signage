/**
 * Text rendering utilities for the 64x64 display
 *
 * All text now uses the compact 3x5 font for maximum display space.
 */

import type { RGB, Frame } from "@signage/core";
import { setPixel } from "@signage/core";

export const DISPLAY_WIDTH = 64;
export const DISPLAY_HEIGHT = 64;

// Compact 3x5 font dimensions (used for all text)
const CHAR_WIDTH = 3;
const CHAR_HEIGHT = 5;

/**
 * Compact 3x5 font for all text rendering
 * Each char is 3 wide x 5 tall
 */
const TINY_FONT: Record<string, number[]> = {
  // Numbers
  "0": [0b111, 0b101, 0b101, 0b101, 0b111],
  "1": [0b010, 0b110, 0b010, 0b010, 0b111],
  "2": [0b111, 0b001, 0b111, 0b100, 0b111],
  "3": [0b111, 0b001, 0b111, 0b001, 0b111],
  "4": [0b101, 0b101, 0b111, 0b001, 0b001],
  "5": [0b111, 0b100, 0b111, 0b001, 0b111],
  "6": [0b111, 0b100, 0b111, 0b101, 0b111],
  "7": [0b111, 0b001, 0b001, 0b001, 0b001],
  "8": [0b111, 0b101, 0b111, 0b101, 0b111],
  "9": [0b111, 0b101, 0b111, 0b001, 0b111],
  // Letters (uppercase)
  "A": [0b010, 0b101, 0b111, 0b101, 0b101],
  "B": [0b110, 0b101, 0b110, 0b101, 0b110],
  "C": [0b011, 0b100, 0b100, 0b100, 0b011],
  "D": [0b110, 0b101, 0b101, 0b101, 0b110],
  "E": [0b111, 0b100, 0b110, 0b100, 0b111],
  "F": [0b111, 0b100, 0b110, 0b100, 0b100],
  "G": [0b011, 0b100, 0b101, 0b101, 0b011],
  "H": [0b101, 0b101, 0b111, 0b101, 0b101],
  "I": [0b111, 0b010, 0b010, 0b010, 0b111],
  "J": [0b011, 0b001, 0b001, 0b101, 0b010],
  "K": [0b101, 0b110, 0b100, 0b110, 0b101],
  "L": [0b100, 0b100, 0b100, 0b100, 0b111],
  "M": [0b101, 0b111, 0b101, 0b101, 0b101],
  "N": [0b101, 0b111, 0b111, 0b101, 0b101],
  "O": [0b010, 0b101, 0b101, 0b101, 0b010],
  "P": [0b110, 0b101, 0b110, 0b100, 0b100],
  "Q": [0b010, 0b101, 0b101, 0b111, 0b011],
  "R": [0b110, 0b101, 0b110, 0b101, 0b101],
  "S": [0b011, 0b100, 0b010, 0b001, 0b110],
  "T": [0b111, 0b010, 0b010, 0b010, 0b010],
  "U": [0b101, 0b101, 0b101, 0b101, 0b111],
  "V": [0b101, 0b101, 0b101, 0b101, 0b010],
  "W": [0b101, 0b101, 0b101, 0b111, 0b101],
  "X": [0b101, 0b101, 0b010, 0b101, 0b101],
  "Y": [0b101, 0b101, 0b010, 0b010, 0b010],
  "Z": [0b111, 0b001, 0b010, 0b100, 0b111],
  // Lowercase (same as uppercase for 3x5)
  "a": [0b010, 0b101, 0b111, 0b101, 0b101],
  "b": [0b110, 0b101, 0b110, 0b101, 0b110],
  "c": [0b011, 0b100, 0b100, 0b100, 0b011],
  "d": [0b110, 0b101, 0b101, 0b101, 0b110],
  "e": [0b111, 0b100, 0b110, 0b100, 0b111],
  "f": [0b111, 0b100, 0b110, 0b100, 0b100],
  "g": [0b011, 0b100, 0b101, 0b101, 0b011],
  "h": [0b101, 0b101, 0b111, 0b101, 0b101],
  "i": [0b111, 0b010, 0b010, 0b010, 0b111],
  "j": [0b011, 0b001, 0b001, 0b101, 0b010],
  "k": [0b101, 0b110, 0b100, 0b110, 0b101],
  "l": [0b100, 0b100, 0b100, 0b100, 0b111],
  "m": [0b101, 0b111, 0b101, 0b101, 0b101],
  "n": [0b101, 0b111, 0b111, 0b101, 0b101],
  "o": [0b010, 0b101, 0b101, 0b101, 0b010],
  "p": [0b110, 0b101, 0b110, 0b100, 0b100],
  "q": [0b010, 0b101, 0b101, 0b111, 0b011],
  "r": [0b110, 0b101, 0b110, 0b101, 0b101],
  "s": [0b011, 0b100, 0b010, 0b001, 0b110],
  "t": [0b111, 0b010, 0b010, 0b010, 0b010],
  "u": [0b101, 0b101, 0b101, 0b101, 0b111],
  "v": [0b101, 0b101, 0b101, 0b101, 0b010],
  "w": [0b101, 0b101, 0b101, 0b111, 0b101],
  "x": [0b101, 0b101, 0b010, 0b101, 0b101],
  "y": [0b101, 0b101, 0b010, 0b010, 0b010],
  "z": [0b111, 0b001, 0b010, 0b100, 0b111],
  // Symbols
  " ": [0b000, 0b000, 0b000, 0b000, 0b000],
  "/": [0b001, 0b001, 0b010, 0b100, 0b100],
  "-": [0b000, 0b000, 0b111, 0b000, 0b000],
  "+": [0b000, 0b010, 0b111, 0b010, 0b000],
  "%": [0b101, 0b001, 0b010, 0b100, 0b101],
  ":": [0b000, 0b010, 0b000, 0b010, 0b000],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  ",": [0b000, 0b000, 0b000, 0b010, 0b100],
  "!": [0b010, 0b010, 0b010, 0b000, 0b010],
  "?": [0b110, 0b001, 0b010, 0b000, 0b010],
  "'": [0b010, 0b010, 0b000, 0b000, 0b000],
  // Arrows for trend display
  "→": [0b010, 0b001, 0b111, 0b001, 0b010], // Right arrow
  ">": [0b100, 0b010, 0b001, 0b010, 0b100], // Greater than as arrow alternative
};

/**
 * Draw text on a frame at specified position, respecting vertical bounds
 * Uses compact 3x5 font for all text rendering
 */
export function drawText(
  frame: Frame,
  text: string,
  startX: number,
  startY: number,
  color: RGB,
  minY: number = 0,
  maxY: number = DISPLAY_HEIGHT - 1
): void {
  let cursorX = startX;

  for (const char of text) {
    const bitmap = TINY_FONT[char];
    // If character is missing, treat as space (advance cursor but draw nothing)
    if (bitmap) {
      for (let row = 0; row < CHAR_HEIGHT; row++) {
        for (let col = 0; col < CHAR_WIDTH; col++) {
          const bit = (bitmap[row] >> (CHAR_WIDTH - 1 - col)) & 1;
          if (bit) {
            const x = cursorX + col;
            const y = startY + row;
            if (x >= 0 && x < DISPLAY_WIDTH && y >= minY && y <= maxY) {
              setPixel(frame, x, y, color);
            }
          }
        }
      }
    }
    // Always advance cursor, even for missing characters
    cursorX += CHAR_WIDTH + 1;
  }
}

/**
 * Calculate the pixel width of a text string
 * Uses compact 3x5 font (3px char + 1px space)
 */
export function measureText(text: string): number {
  if (text.length === 0) return 0;
  return text.length * (CHAR_WIDTH + 1) - 1;
}

/**
 * Calculate X position to center text horizontally
 */
export function centerX(text: string): number {
  return Math.floor((DISPLAY_WIDTH - measureText(text)) / 2);
}

/**
 * Draw a horizontal separator line
 */
export function drawSeparator(frame: Frame, y: number, color: RGB): void {
  for (let x = 4; x < DISPLAY_WIDTH - 4; x++) {
    setPixel(frame, x, y, color);
  }
}

// Legacy aliases for drawTinyText
const TINY_CHAR_WIDTH = CHAR_WIDTH;
const TINY_CHAR_HEIGHT = CHAR_HEIGHT;

/**
 * Calculate the pixel width of a tiny text string
 */
export function measureTinyText(text: string): number {
  if (text.length === 0) return 0;
  return text.length * (TINY_CHAR_WIDTH + 1) - 1;
}

/**
 * Draw tiny text (3x5 font) for legends
 */
export function drawTinyText(
  frame: Frame,
  text: string,
  startX: number,
  startY: number,
  color: RGB
): void {
  let cursorX = startX;

  for (const char of text) {
    const bitmap = TINY_FONT[char];
    if (!bitmap) continue;

    for (let row = 0; row < TINY_CHAR_HEIGHT; row++) {
      for (let col = 0; col < TINY_CHAR_WIDTH; col++) {
        const bit = (bitmap[row] >> (TINY_CHAR_WIDTH - 1 - col)) & 1;
        if (bit) {
          const x = cursorX + col;
          const y = startY + row;
          if (x >= 0 && x < DISPLAY_WIDTH && y >= 0 && y < DISPLAY_HEIGHT) {
            setPixel(frame, x, y, color);
          }
        }
      }
    }

    cursorX += TINY_CHAR_WIDTH + 1;
  }
}
