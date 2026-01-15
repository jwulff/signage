import { describe, it, expect } from "vitest";
import {
  createSolidFrame,
  setPixel,
  getPixel,
  encodeFrameToBase64,
  decodeBase64ToPixels,
  PIXOO64_SIZE,
} from "./pixoo";

describe("pixoo", () => {
  describe("createSolidFrame", () => {
    it("creates a frame with correct dimensions", () => {
      const frame = createSolidFrame(64, 64, { r: 0, g: 0, b: 0 });
      expect(frame.width).toBe(64);
      expect(frame.height).toBe(64);
      expect(frame.pixels.length).toBe(64 * 64 * 3);
    });

    it("fills with the specified color", () => {
      const frame = createSolidFrame(2, 2, { r: 255, g: 128, b: 64 });
      expect(frame.pixels[0]).toBe(255);
      expect(frame.pixels[1]).toBe(128);
      expect(frame.pixels[2]).toBe(64);
    });
  });

  describe("setPixel/getPixel", () => {
    it("sets and gets pixel values", () => {
      const frame = createSolidFrame(10, 10, { r: 0, g: 0, b: 0 });
      setPixel(frame, 5, 5, { r: 255, g: 128, b: 64 });
      const pixel = getPixel(frame, 5, 5);
      expect(pixel).toEqual({ r: 255, g: 128, b: 64 });
    });

    it("ignores out of bounds writes", () => {
      const frame = createSolidFrame(10, 10, { r: 0, g: 0, b: 0 });
      setPixel(frame, -1, 0, { r: 255, g: 0, b: 0 });
      setPixel(frame, 100, 0, { r: 255, g: 0, b: 0 });
      // Should not throw
    });

    it("returns null for out of bounds reads", () => {
      const frame = createSolidFrame(10, 10, { r: 0, g: 0, b: 0 });
      expect(getPixel(frame, -1, 0)).toBeNull();
      expect(getPixel(frame, 100, 0)).toBeNull();
    });
  });

  describe("encodeFrameToBase64/decodeBase64ToPixels", () => {
    it("roundtrips frame data", () => {
      const frame = createSolidFrame(4, 4, { r: 100, g: 150, b: 200 });
      const encoded = encodeFrameToBase64(frame);
      const decoded = decodeBase64ToPixels(encoded, 4, 4);
      expect(decoded.pixels).toEqual(frame.pixels);
    });
  });

  describe("PIXOO64_SIZE", () => {
    it("is 64", () => {
      expect(PIXOO64_SIZE).toBe(64);
    });
  });
});
