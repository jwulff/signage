/**
 * Tests for frame composer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPixel } from "@signage/core";
import { generateCompositeFrame, type CompositorData } from "../frame-composer.js";

describe("generateCompositeFrame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-24T14:30:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a 64x64 frame", () => {
    const data: CompositorData = {
      bloodSugar: null,
    };

    const frame = generateCompositeFrame(data);

    expect(frame.width).toBe(64);
    expect(frame.height).toBe(64);
    expect(frame.pixels.length).toBe(64 * 64 * 3);
  });

  it("renders clock region at top", () => {
    const data: CompositorData = {
      bloodSugar: null,
      timezone: "America/Los_Angeles",
    };

    const frame = generateCompositeFrame(data);

    // Check for pixels in clock region (top half)
    let hasClockPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 4);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasClockPixels = true;
        break;
      }
    }
    expect(hasClockPixels).toBe(true);
  });

  it("renders blood sugar region in bottom half", () => {
    const data: CompositorData = {
      bloodSugar: {
        glucose: 120,
        trend: "Flat",
        delta: 5,
        timestamp: Date.now(),
        rangeStatus: "normal",
        isStale: false,
      },
      timezone: "America/Los_Angeles",
    };

    const frame = generateCompositeFrame(data);

    // Check for pixels in blood sugar region (bottom half, rows 32-63)
    let hasBloodSugarPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 36);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasBloodSugarPixels = true;
        break;
      }
    }
    expect(hasBloodSugarPixels).toBe(true);
  });

  it("renders readiness region when data provided", () => {
    const data: CompositorData = {
      bloodSugar: null,
      readiness: [
        {
          initial: "J",
          score: 85,
          sleepScore: 90,
          isStale: false,
        },
      ],
    };

    const frame = generateCompositeFrame(data);

    // Check for pixels in readiness region (row 27)
    let hasReadinessPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 27);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasReadinessPixels = true;
        break;
      }
    }
    expect(hasReadinessPixels).toBe(true);
  });

  it("skips readiness region when no data", () => {
    const data: CompositorData = {
      bloodSugar: null,
      readiness: [],
    };

    const frame = generateCompositeFrame(data);

    // Frame should still be valid
    expect(frame.width).toBe(64);
    expect(frame.height).toBe(64);
  });

  it("handles null blood sugar data gracefully", () => {
    const data: CompositorData = {
      bloodSugar: null,
    };

    const frame = generateCompositeFrame(data);

    // Should show error text in blood sugar region
    let hasBottomPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 32; y < 64; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasBottomPixels = true;
          break;
        }
      }
      if (hasBottomPixels) break;
    }
    expect(hasBottomPixels).toBe(true);
  });

  it("includes weather data in clock region when provided", () => {
    const data: CompositorData = {
      bloodSugar: null,
      weather: {
        tempNow: 60,
        tempMinus6h: 55,
        tempPlus6h: 65,
      },
    };

    const frame = generateCompositeFrame(data);

    // Weather band should have some pixels (rows 18-25)
    let hasWeatherPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 20);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasWeatherPixels = true;
        break;
      }
    }
    expect(hasWeatherPixels).toBe(true);
  });

  it("includes blood sugar history chart when provided", () => {
    const now = Date.now();
    const data: CompositorData = {
      bloodSugar: {
        glucose: 120,
        trend: "Flat",
        delta: 5,
        timestamp: now,
        rangeStatus: "normal",
        isStale: false,
      },
      bloodSugarHistory: {
        points: [
          { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
          { timestamp: now - 1 * 60 * 60 * 1000, glucose: 110 },
          { timestamp: now, glucose: 120 },
        ],
      },
    };

    const frame = generateCompositeFrame(data);

    // Chart should have pixels in rows 42-62
    let hasChartPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 45; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasChartPixels = true;
          break;
        }
      }
      if (hasChartPixels) break;
    }
    expect(hasChartPixels).toBe(true);
  });
});
