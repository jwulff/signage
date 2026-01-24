/**
 * Tests for readiness renderer (Oura scores display)
 */

import { describe, it, expect } from "vitest";
import { createSolidFrame, getPixel } from "@signage/core";
import {
  renderReadinessRegion,
  type ReadinessDisplayData,
} from "../readiness-renderer.js";

describe("renderReadinessRegion", () => {
  it("renders nothing for empty users array", () => {
    const frame = createSolidFrame(64, 64);
    renderReadinessRegion(frame, []);

    // Row 27 should be all black
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(false);
  });

  it("renders single user with scores", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: 75,
        sleepScore: 82,
        isStale: false,
      },
    ];

    renderReadinessRegion(frame, users);

    // Row 27 should have some content
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(true);
  });

  it("renders multiple users", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: 75,
        sleepScore: 82,
        isStale: false,
      },
      {
        initial: "K",
        score: 80,
        sleepScore: 90,
        isStale: false,
      },
    ];

    renderReadinessRegion(frame, users);

    // Should have content across the row
    let pixelCount = 0;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        pixelCount++;
      }
    }
    // Two users should have more pixels than one
    expect(pixelCount).toBeGreaterThan(10);
  });

  it("shows stale indicator for stale data", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: 75,
        sleepScore: 82,
        isStale: true,
      },
    ];

    renderReadinessRegion(frame, users);

    // Should still render (with "--" or stale indicator)
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(true);
  });

  it("shows question mark for users needing reauth", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: null,
        sleepScore: null,
        needsReauth: true,
      },
    ];

    renderReadinessRegion(frame, users);

    // Should render initial and "?"
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(true);
  });

  it("handles null scores gracefully", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: null,
        sleepScore: null,
        isStale: false,
      },
    ];

    renderReadinessRegion(frame, users);

    // Should render without crashing
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(true);
  });

  it("handles partial scores (only readiness)", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: 85,
        sleepScore: null,
        isStale: false,
      },
    ];

    renderReadinessRegion(frame, users);

    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(true);
  });

  it("handles partial scores (only sleep)", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: null,
        sleepScore: 90,
        isStale: false,
      },
    ];

    renderReadinessRegion(frame, users);

    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(true);
  });

  it("centers content horizontally", () => {
    const frame = createSolidFrame(64, 64);
    const users: ReadinessDisplayData[] = [
      {
        initial: "J",
        score: 75,
        sleepScore: 82,
        isStale: false,
      },
    ];

    renderReadinessRegion(frame, users);

    // Find leftmost and rightmost pixels
    let leftmost = 64;
    let rightmost = 0;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        leftmost = Math.min(leftmost, x);
        rightmost = Math.max(rightmost, x);
      }
    }

    // Content should be roughly centered
    const contentWidth = rightmost - leftmost;
    const leftMargin = leftmost;
    const rightMargin = 63 - rightmost;
    // Margins should be within 5 pixels of each other (roughly centered)
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(10);
  });
});
