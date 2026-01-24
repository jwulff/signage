/**
 * Tests for treatment renderer
 */

import { describe, it, expect } from "vitest";
import { createSolidFrame } from "@signage/core";
import {
  calculateTreatmentTotals,
  renderTreatmentSummary,
  renderTreatmentMarkers,
} from "./treatment-renderer.js";
import type { TreatmentDisplayData, GlookoTreatment } from "../glooko/types.js";

describe("calculateTreatmentTotals", () => {
  it("sums insulin and carbs within window", () => {
    const now = Date.now();
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 1 * 60 * 60 * 1000, type: "insulin", value: 2.5 },
      { timestamp: now - 2 * 60 * 60 * 1000, type: "insulin", value: 3.0 },
      { timestamp: now - 3 * 60 * 60 * 1000, type: "carbs", value: 30 },
      { timestamp: now - 3.5 * 60 * 60 * 1000, type: "carbs", value: 12 },
    ];

    const totals = calculateTreatmentTotals(treatments, 4);

    expect(totals.insulinUnits).toBe(5.5);
    expect(totals.carbGrams).toBe(42);
  });

  it("excludes treatments outside window", () => {
    const now = Date.now();
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 1 * 60 * 60 * 1000, type: "insulin", value: 2.5 },
      { timestamp: now - 5 * 60 * 60 * 1000, type: "insulin", value: 10.0 }, // Outside 4h window
      { timestamp: now - 2 * 60 * 60 * 1000, type: "carbs", value: 30 },
      { timestamp: now - 6 * 60 * 60 * 1000, type: "carbs", value: 100 }, // Outside 4h window
    ];

    const totals = calculateTreatmentTotals(treatments, 4);

    expect(totals.insulinUnits).toBe(2.5);
    expect(totals.carbGrams).toBe(30);
  });

  it("returns zeros for empty treatments", () => {
    const totals = calculateTreatmentTotals([], 4);

    expect(totals.insulinUnits).toBe(0);
    expect(totals.carbGrams).toBe(0);
  });

  it("rounds insulin to one decimal place", () => {
    const now = Date.now();
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 1 * 60 * 60 * 1000, type: "insulin", value: 1.333 },
      { timestamp: now - 2 * 60 * 60 * 1000, type: "insulin", value: 2.666 },
    ];

    const totals = calculateTreatmentTotals(treatments, 4);

    // 1.333 + 2.666 = 3.999, rounded to 4.0
    expect(totals.insulinUnits).toBe(4.0);
  });

  it("rounds carbs to nearest integer", () => {
    const now = Date.now();
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 1 * 60 * 60 * 1000, type: "carbs", value: 15.7 },
      { timestamp: now - 2 * 60 * 60 * 1000, type: "carbs", value: 20.3 },
    ];

    const totals = calculateTreatmentTotals(treatments, 4);

    expect(totals.carbGrams).toBe(36);
  });
});

describe("renderTreatmentSummary", () => {
  it("does not render when data is null", () => {
    const frame = createSolidFrame(64, 64);

    renderTreatmentSummary(frame, null, 63, 34);

    // Check that no pixels were set (frame should be all black)
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(false);
  });

  it("does not render when both values are zero", () => {
    const frame = createSolidFrame(64, 64);
    const data: TreatmentDisplayData = {
      recentInsulinUnits: 0,
      recentCarbsGrams: 0,
      treatments: [],
      lastFetchedAt: Date.now(),
      isStale: false,
    };

    renderTreatmentSummary(frame, data, 63, 34);

    // Check that no pixels were set
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(false);
  });

  it("renders insulin-only summary", () => {
    const frame = createSolidFrame(64, 64);
    const data: TreatmentDisplayData = {
      recentInsulinUnits: 8.5,
      recentCarbsGrams: 0,
      treatments: [],
      lastFetchedAt: Date.now(),
      isStale: false,
    };

    renderTreatmentSummary(frame, data, 63, 34);

    // Check that some pixels were set
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(true);
  });

  it("renders carbs-only summary", () => {
    const frame = createSolidFrame(64, 64);
    const data: TreatmentDisplayData = {
      recentInsulinUnits: 0,
      recentCarbsGrams: 42,
      treatments: [],
      lastFetchedAt: Date.now(),
      isStale: false,
    };

    renderTreatmentSummary(frame, data, 63, 34);

    // Check that some pixels were set
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(true);
  });

  it("renders both insulin and carbs summary", () => {
    const frame = createSolidFrame(64, 64);
    const data: TreatmentDisplayData = {
      recentInsulinUnits: 8.5,
      recentCarbsGrams: 42,
      treatments: [],
      lastFetchedAt: Date.now(),
      isStale: false,
    };

    renderTreatmentSummary(frame, data, 63, 34);

    // Check that some pixels were set
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(true);
  });
});

describe("renderTreatmentMarkers", () => {
  it("renders nothing for empty treatments", () => {
    const frame = createSolidFrame(64, 64);

    renderTreatmentMarkers(frame, [], {
      x: 1,
      y: 42,
      width: 62,
      height: 21,
      hours: 3,
    });

    // Check that no pixels were set
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(false);
  });

  it("renders insulin markers at top of chart", () => {
    const now = Date.now();
    const frame = createSolidFrame(64, 64);
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 1.5 * 60 * 60 * 1000, type: "insulin", value: 5 },
    ];

    renderTreatmentMarkers(frame, treatments, {
      x: 1,
      y: 42,
      width: 62,
      height: 21,
      hours: 3,
    });

    // Check that some pixels were set in the chart region
    let hasPixelsInChartRegion = false;
    for (let y = 42; y < 46; y++) {
      // Top portion of chart
      for (let x = 1; x < 63; x++) {
        const idx = (y * 64 + x) * 3;
        if (frame.pixels[idx] !== 0 || frame.pixels[idx + 1] !== 0 || frame.pixels[idx + 2] !== 0) {
          hasPixelsInChartRegion = true;
          break;
        }
      }
    }
    expect(hasPixelsInChartRegion).toBe(true);
  });

  it("renders carb markers at bottom of chart", () => {
    const now = Date.now();
    const frame = createSolidFrame(64, 64);
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 1.5 * 60 * 60 * 1000, type: "carbs", value: 30 },
    ];

    renderTreatmentMarkers(frame, treatments, {
      x: 1,
      y: 42,
      width: 62,
      height: 21,
      hours: 3,
    });

    // Check that some pixels were set in the bottom portion of chart
    let hasPixelsInBottomRegion = false;
    for (let y = 59; y < 63; y++) {
      // Bottom portion of chart
      for (let x = 1; x < 63; x++) {
        const idx = (y * 64 + x) * 3;
        if (frame.pixels[idx] !== 0 || frame.pixels[idx + 1] !== 0 || frame.pixels[idx + 2] !== 0) {
          hasPixelsInBottomRegion = true;
          break;
        }
      }
    }
    expect(hasPixelsInBottomRegion).toBe(true);
  });

  it("filters out treatments outside time window", () => {
    const now = Date.now();
    const frame = createSolidFrame(64, 64);
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 5 * 60 * 60 * 1000, type: "insulin", value: 5 }, // 5h ago, outside 3h window
    ];

    renderTreatmentMarkers(frame, treatments, {
      x: 1,
      y: 42,
      width: 62,
      height: 21,
      hours: 3,
    });

    // Check that no pixels were set since treatment is outside window
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(false);
  });

  it("handles offset hours correctly", () => {
    const now = Date.now();
    const frame = createSolidFrame(64, 64);
    const treatments: GlookoTreatment[] = [
      { timestamp: now - 4 * 60 * 60 * 1000, type: "insulin", value: 5 }, // 4h ago
    ];

    // Window from -6h to -3h (offset of 3h)
    renderTreatmentMarkers(frame, treatments, {
      x: 1,
      y: 42,
      width: 62,
      height: 21,
      hours: 3,
      offsetHours: 3,
    });

    // Treatment at -4h should be visible in the -6h to -3h window
    const hasPixels = frame.pixels.some((v) => v !== 0);
    expect(hasPixels).toBe(true);
  });
});
