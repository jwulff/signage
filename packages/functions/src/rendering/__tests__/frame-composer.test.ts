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

  it("renders blood sugar region near top", () => {
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

    // Check for pixels in blood sugar region
    // Glucose reading is now at rows 7-11 (below date/time)
    let hasBloodSugarPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 9); // Middle of text row (7-11)
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasBloodSugarPixels = true;
        break;
      }
    }
    expect(hasBloodSugarPixels).toBe(true);
  });

  it("handles null blood sugar data gracefully", () => {
    const data: CompositorData = {
      bloodSugar: null,
    };

    const frame = generateCompositeFrame(data);

    // Should show error text in blood sugar region
    // Glucose reading (or error) is at rows 7-11
    let hasErrorPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 7; y < 12; y++) { // Check text row area (7-11)
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasErrorPixels = true;
          break;
        }
      }
      if (hasErrorPixels) break;
    }
    expect(hasErrorPixels).toBe(true);
  });

  it("accepts weather data without errors (weather band disabled in current layout)", () => {
    const data: CompositorData = {
      bloodSugar: null,
      weather: {
        tempNow: 60,
        tempMinus6h: 55,
        tempPlus6h: 65,
      },
    };

    // Weather band is disabled in current layout to maximize chart space
    // Just verify the frame generates without errors
    const frame = generateCompositeFrame(data);
    expect(frame.width).toBe(64);
    expect(frame.height).toBe(64);
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

    // Chart should have pixels in rows 13-40 (expanded chart area)
    let hasChartPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 15; y < 38; y++) {
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

  it("renders treatment chart with insulin totals as blue numbers", () => {
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
      treatments: {
        treatments: [
          // Insulin across multiple days (midnight to midnight)
          { timestamp: now - 2 * 60 * 60 * 1000, type: "insulin", value: 5 },
          { timestamp: now - 26 * 60 * 60 * 1000, type: "insulin", value: 8 },
        ],
        recentInsulinUnits: 5,
        recentCarbsGrams: 0,
        lastFetchedAt: now,
        isStale: false,
      },
    };

    const frame = generateCompositeFrame(data);

    // Treatment chart is now at rows 42-48 (below chart)
    // Should have blue pixels for insulin numbers (5-day totals)
    let hasBluePixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 42; y < 49; y++) {
        const pixel = getPixel(frame, x, y);
        // Insulin numbers are blue (b > r)
        if (pixel && pixel.b > pixel.r && pixel.b > 30) {
          hasBluePixels = true;
          break;
        }
      }
      if (hasBluePixels) break;
    }
    expect(hasBluePixels).toBe(true);
  });

  it("does not render treatment chart when treatments are stale", () => {
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
      treatments: {
        treatments: [
          { timestamp: now - 5 * 60 * 60 * 1000, type: "insulin", value: 10 },
        ],
        recentInsulinUnits: 10,
        recentCarbsGrams: 0,
        lastFetchedAt: now - 7 * 60 * 60 * 1000, // 7 hours ago
        isStale: true, // Stale data should not render
      },
    };

    const frame = generateCompositeFrame(data);

    // Treatment chart (rows 42-48) should NOT have any significant pixels when stale
    let hasTreatmentPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 42; y < 49; y++) {
        const pixel = getPixel(frame, x, y);
        // Check for any bright pixels (blue numbers)
        if (pixel && (pixel.b > 50 || pixel.r > 80)) {
          hasTreatmentPixels = true;
          break;
        }
      }
      if (hasTreatmentPixels) break;
    }
    expect(hasTreatmentPixels).toBe(false);
  });
});
