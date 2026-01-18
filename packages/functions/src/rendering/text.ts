/**
 * Text rendering utilities for the 64x64 display
 */

import type { RGB, Frame } from "@signage/core";
import { setPixel } from "@signage/core";
import { getCharBitmap, CHAR_WIDTH, CHAR_HEIGHT } from "../font.js";

export const DISPLAY_WIDTH = 64;
export const DISPLAY_HEIGHT = 64;

/**
 * Draw text on a frame at specified position, respecting vertical bounds
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
    const bitmap = getCharBitmap(char);

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

    cursorX += CHAR_WIDTH + 1;
  }
}

/**
 * Calculate the pixel width of a text string
 */
export function measureText(text: string): number {
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

/**
 * Tiny 3x5 font for legends/labels
 * Each char is 3 wide x 5 tall
 */
const TINY_FONT: Record<string, number[]> = {
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
  h: [0b100, 0b100, 0b111, 0b101, 0b101],
  m: [0b000, 0b000, 0b111, 0b111, 0b101],
  " ": [0b000, 0b000, 0b000, 0b000, 0b000],
};

const TINY_CHAR_WIDTH = 3;
const TINY_CHAR_HEIGHT = 5;

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
