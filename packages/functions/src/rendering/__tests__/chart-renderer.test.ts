/**
 * Tests for chart renderer (blood sugar sparkline)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSolidFrame, getPixel } from "@signage/core";
import { renderChart, type ChartPoint, type ChartConfig } from "../chart-renderer.js";

describe("renderChart", () => {
  const now = Date.now();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing for empty points array", () => {
    const frame = createSolidFrame(64, 64);
    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
    };

    renderChart(frame, [], config);

    // Should be all black
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasPixels = true;
          break;
        }
      }
    }
    expect(hasPixels).toBe(false);
  });

  it("renders chart line for valid points", () => {
    const frame = createSolidFrame(64, 64);
    const points: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now - 1 * 60 * 60 * 1000, glucose: 120 },
      { timestamp: now, glucose: 110 },
    ];

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
    };

    renderChart(frame, points, config);

    // Should have some pixels in the chart area
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasPixels = true;
          break;
        }
      }
      if (hasPixels) break;
    }
    expect(hasPixels).toBe(true);
  });

  it("filters out points outside time range", () => {
    const frame = createSolidFrame(64, 64);
    // All points are older than the 3-hour window
    const points: ChartPoint[] = [
      { timestamp: now - 5 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now - 4 * 60 * 60 * 1000, glucose: 120 },
    ];

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
    };

    renderChart(frame, points, config);

    // Should be all black (no points in range)
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasPixels = true;
          break;
        }
      }
    }
    expect(hasPixels).toBe(false);
  });

  it("renders green for in-range glucose values", () => {
    const frame = createSolidFrame(64, 64);
    // All values in normal range (70-180)
    const points: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now - 1 * 60 * 60 * 1000, glucose: 110 },
      { timestamp: now, glucose: 120 },
    ];

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
    };

    renderChart(frame, points, config);

    // Find a chart pixel and verify it's greenish
    let foundGreenPixel = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && pixel.g > pixel.r && pixel.g > pixel.b) {
          foundGreenPixel = true;
          break;
        }
      }
      if (foundGreenPixel) break;
    }
    expect(foundGreenPixel).toBe(true);
  });

  it("renders red/orange for low glucose values", () => {
    const frame = createSolidFrame(64, 64);
    // All values in low range
    const points: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 60 },
      { timestamp: now - 1 * 60 * 60 * 1000, glucose: 55 },
      { timestamp: now, glucose: 65 },
    ];

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
    };

    renderChart(frame, points, config);

    // Find a chart pixel and verify it's reddish/orange
    let foundWarmPixel = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && pixel.r > 0 && pixel.r >= pixel.b) {
          foundWarmPixel = true;
          break;
        }
      }
      if (foundWarmPixel) break;
    }
    expect(foundWarmPixel).toBe(true);
  });

  it("renders yellow for high glucose values", () => {
    const frame = createSolidFrame(64, 64);
    // All values in high range
    const points: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 200 },
      { timestamp: now - 1 * 60 * 60 * 1000, glucose: 220 },
      { timestamp: now, glucose: 210 },
    ];

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
    };

    renderChart(frame, points, config);

    // Find a chart pixel and verify it's yellowish (high R and G)
    let foundYellowPixel = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && pixel.r > 100 && pixel.g > 100 && pixel.b < pixel.r) {
          foundYellowPixel = true;
          break;
        }
      }
      if (foundYellowPixel) break;
    }
    expect(foundYellowPixel).toBe(true);
  });

  it("respects chart bounds", () => {
    const frame = createSolidFrame(64, 64);
    const points: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now - 1 * 60 * 60 * 1000, glucose: 200 },
      { timestamp: now, glucose: 50 },
    ];

    const config: ChartConfig = {
      x: 10,
      y: 40,
      width: 30,
      height: 15,
      hours: 3,
    };

    renderChart(frame, points, config);

    // Check pixels are within bounds
    // Left of bounds should be black
    for (let y = 40; y < 55; y++) {
      const pixel = getPixel(frame, 5, y);
      expect(pixel).toEqual({ r: 0, g: 0, b: 0 });
    }

    // Right of bounds should be black
    for (let y = 40; y < 55; y++) {
      const pixel = getPixel(frame, 45, y);
      expect(pixel).toEqual({ r: 0, g: 0, b: 0 });
    }

    // Should have content within bounds
    let hasPixelsInBounds = false;
    for (let x = 10; x < 40; x++) {
      for (let y = 40; y < 55; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasPixelsInBounds = true;
          break;
        }
      }
      if (hasPixelsInBounds) break;
    }
    expect(hasPixelsInBounds).toBe(true);
  });

  it("renders time markers as vertical lines", () => {
    const frame = createSolidFrame(64, 64);
    const points: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now, glucose: 120 },
    ];

    // Add a time marker in the middle of the chart
    const markerTime = now - 1.5 * 60 * 60 * 1000;

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
      timeMarkers: [markerTime],
    };

    renderChart(frame, points, config);

    // Should have a vertical line at approximately x=32 (middle)
    // The marker should span the full height
    let markerPixelCount = 0;
    const expectedX = Math.round((1.5 / 3) * 63); // ~32
    for (let y = 40; y < 60; y++) {
      const pixel = getPixel(frame, expectedX, y);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        markerPixelCount++;
      }
    }
    // Should have most of the height filled (some may be overwritten by chart line)
    expect(markerPixelCount).toBeGreaterThan(10);
  });

  it("handles offset hours correctly", () => {
    const frame = createSolidFrame(64, 64);
    // Points at various times
    const points: ChartPoint[] = [
      { timestamp: now - 5 * 60 * 60 * 1000, glucose: 100 }, // 5h ago
      { timestamp: now - 4 * 60 * 60 * 1000, glucose: 120 }, // 4h ago
      { timestamp: now - 3 * 60 * 60 * 1000, glucose: 110 }, // 3h ago - edge
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 130 }, // 2h ago - excluded
      { timestamp: now, glucose: 100 }, // now - excluded
    ];

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
      offsetHours: 3, // Chart shows -6h to -3h, not -3h to now
    };

    renderChart(frame, points, config);

    // Should have rendered something (the 5h ago and 4h ago points)
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasPixels = true;
          break;
        }
      }
      if (hasPixels) break;
    }
    expect(hasPixels).toBe(true);
  });

  it("adapts Y scale to data range", () => {
    const frameNarrow = createSolidFrame(64, 64);
    const frameWide = createSolidFrame(64, 64);

    // Narrow range: 100-110
    const narrowPoints: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now, glucose: 110 },
    ];

    // Wide range: 50-250
    const widePoints: ChartPoint[] = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 50 },
      { timestamp: now, glucose: 250 },
    ];

    const config: ChartConfig = {
      x: 0,
      y: 40,
      width: 64,
      height: 20,
      hours: 3,
    };

    renderChart(frameNarrow, narrowPoints, config);
    renderChart(frameWide, widePoints, config);

    // Both should render successfully
    let narrowHasPixels = false;
    let wideHasPixels = false;

    for (let x = 0; x < 64; x++) {
      for (let y = 40; y < 60; y++) {
        const nPixel = getPixel(frameNarrow, x, y);
        const wPixel = getPixel(frameWide, x, y);
        if (nPixel && (nPixel.r > 0 || nPixel.g > 0 || nPixel.b > 0)) {
          narrowHasPixels = true;
        }
        if (wPixel && (wPixel.r > 0 || wPixel.g > 0 || wPixel.b > 0)) {
          wideHasPixels = true;
        }
      }
    }

    expect(narrowHasPixels).toBe(true);
    expect(wideHasPixels).toBe(true);
  });
});
