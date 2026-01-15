/**
 * Pixoo64 protocol implementation
 *
 * The Pixoo64 has a local HTTP API at port 80.
 * Endpoint: POST http://<ip>/post
 *
 * Frame format:
 * - 64x64 pixels
 * - RGB (3 bytes per pixel)
 * - Base64 encoded
 * - Total: 64 * 64 * 3 = 12,288 bytes raw, ~16KB base64
 */

import type { Frame, RGB } from "./types";

/** Default Pixoo64 display size */
export const PIXOO64_SIZE = 64;

/** Bytes per pixel (RGB) */
export const BYTES_PER_PIXEL = 3;

/**
 * Create an empty frame filled with a single color
 */
export function createSolidFrame(
  width: number,
  height: number,
  color: RGB = { r: 0, g: 0, b: 0 }
): Frame {
  const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let i = 0; i < width * height; i++) {
    const offset = i * BYTES_PER_PIXEL;
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
  }
  return { width, height, pixels };
}

/**
 * Set a single pixel in a frame
 */
export function setPixel(
  frame: Frame,
  x: number,
  y: number,
  color: RGB
): void {
  if (x < 0 || x >= frame.width || y < 0 || y >= frame.height) {
    return; // Out of bounds, silently ignore
  }
  const offset = (y * frame.width + x) * BYTES_PER_PIXEL;
  frame.pixels[offset] = color.r;
  frame.pixels[offset + 1] = color.g;
  frame.pixels[offset + 2] = color.b;
}

/**
 * Get a pixel color from a frame
 */
export function getPixel(frame: Frame, x: number, y: number): RGB | null {
  if (x < 0 || x >= frame.width || y < 0 || y >= frame.height) {
    return null;
  }
  const offset = (y * frame.width + x) * BYTES_PER_PIXEL;
  return {
    r: frame.pixels[offset],
    g: frame.pixels[offset + 1],
    b: frame.pixels[offset + 2],
  };
}

/**
 * Encode frame pixels to base64 for Pixoo API
 */
export function encodeFrameToBase64(frame: Frame): string {
  // In Node.js, use Buffer; in browser, use btoa
  if (typeof Buffer !== "undefined") {
    return Buffer.from(frame.pixels).toString("base64");
  }
  // Browser fallback
  let binary = "";
  for (let i = 0; i < frame.pixels.length; i++) {
    binary += String.fromCharCode(frame.pixels[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 to frame pixels
 */
export function decodeBase64ToPixels(
  base64: string,
  width: number,
  height: number
): Frame {
  let pixels: Uint8Array;
  if (typeof Buffer !== "undefined") {
    pixels = new Uint8Array(Buffer.from(base64, "base64"));
  } else {
    // Browser fallback
    const binary = atob(base64);
    pixels = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      pixels[i] = binary.charCodeAt(i);
    }
  }
  return { width, height, pixels };
}

/**
 * Build Pixoo SendHttpGif command payload
 */
export interface PixooCommand {
  Command: string;
  PicNum: number;
  PicWidth: number;
  PicOffset: number;
  PicID: number;
  PicSpeed: number;
  PicData: string;
}

/**
 * Create a Pixoo Draw/SendHttpGif command
 */
export function createPixooFrameCommand(
  frame: Frame,
  options: {
    picId?: number;
    speed?: number;
  } = {}
): PixooCommand {
  const { picId = 1, speed = 1000 } = options;

  return {
    Command: "Draw/SendHttpGif",
    PicNum: 1,
    PicWidth: frame.width,
    PicOffset: 0,
    PicID: picId,
    PicSpeed: speed,
    PicData: encodeFrameToBase64(frame),
  };
}
