/**
 * Tests for chart renderer - specifically time marker positioning
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderChart } from "./chart-renderer.js";
import type { Frame, RGB } from "@signage/core";

// Mock setPixel to track what pixels are drawn
const drawnPixels: Array<{ x: number; y: number; color: RGB }> = [];

vi.mock("@signage/core", async () => {
  const actual = await vi.importActual("@signage/core");
  return {
    ...actual,
    setPixel: vi.fn((_frame: Frame, x: number, y: number, color: RGB) => {
      drawnPixels.push({ x, y, color });
    }),
  };
});

describe("renderChart time markers", () => {
  let mockFrame: Frame;

  beforeEach(() => {
    drawnPixels.length = 0;
    mockFrame = {
      pixels: new Uint8Array(64 * 64 * 3),
      width: 64,
      height: 64,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not draw marker at exclusive end for offset charts", () => {
    // At exactly 21:00:00, the 6pm marker (18:00) is at exactly endTime (now - 3h)
    // For the left chart (offsetHours=3), this should NOT be drawn due to exclusive end
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-30T21:00:00.000-08:00"));

    const points = [
      { timestamp: Date.now() - 2 * 60 * 60 * 1000, glucose: 100 }, // 2h ago
      { timestamp: Date.now() - 1 * 60 * 60 * 1000, glucose: 110 }, // 1h ago
    ];

    // Calculate the 6pm marker timestamp (exactly 3h ago = now - 3h)
    const now = Date.now();
    const sixPmMarker = now - 3 * 60 * 60 * 1000;

    renderChart(mockFrame, points, {
      x: 1,
      y: 40,
      width: 31,
      height: 23,
      hours: 21,
      offsetHours: 3, // Left chart - uses exclusive end
      timeMarkers: [sixPmMarker],
      timezone: "America/Los_Angeles",
    });

    // The 6pm marker at exactly endTime should NOT be drawn (exclusive end)
    // Check that no vertical line at x=31 (the rightmost pixel) was drawn
    const pixelsAtBoundary = drawnPixels.filter(p => p.x === 31);

    // The chart points should be drawn, but not the marker at x=31
    // Since the marker is at endTime with exclusive end, it should not appear
    // We need to verify no marker line (23 pixels tall) was drawn at x=31
    const markerHeight = 23;
    expect(pixelsAtBoundary.length).toBeLessThan(markerHeight);
  });

  it("draws marker at inclusive end for non-offset charts", () => {
    // For the right chart (offsetHours=0), markers at endTime should be drawn
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-30T21:00:00.000-08:00"));

    const now = Date.now();
    const points = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now - 1 * 60 * 60 * 1000, glucose: 110 },
    ];

    // For the right chart, a marker at exactly now (endTime) should be drawn
    const markerAtEnd = now;

    renderChart(mockFrame, points, {
      x: 32,
      y: 40,
      width: 31,
      height: 23,
      hours: 3,
      // offsetHours defaults to 0 - uses inclusive end
      timeMarkers: [markerAtEnd],
      timezone: "America/Los_Angeles",
    });

    // The marker at endTime should be drawn at x=62 (rightmost pixel of right chart)
    // A marker line is 23 pixels tall
    const pixelsAtRightEdge = drawnPixels.filter(p => p.x === 62);
    expect(pixelsAtRightEdge.length).toBeGreaterThanOrEqual(23);
  });

  it("right chart draws marker at startTime", () => {
    // At exactly 21:00:00, the 6pm marker should appear in the right chart at x=32
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-30T21:00:00.000-08:00"));

    const now = Date.now();
    const points = [
      { timestamp: now - 2 * 60 * 60 * 1000, glucose: 100 },
      { timestamp: now - 1 * 60 * 60 * 1000, glucose: 110 },
    ];

    // 6pm marker = exactly 3h ago = startTime for right chart
    const sixPmMarker = now - 3 * 60 * 60 * 1000;

    renderChart(mockFrame, points, {
      x: 32,
      y: 40,
      width: 31,
      height: 23,
      hours: 3,
      timeMarkers: [sixPmMarker],
      timezone: "America/Los_Angeles",
    });

    // The marker at startTime should be drawn at x=32 (leftmost pixel of right chart)
    const pixelsAtLeftEdge = drawnPixels.filter(p => p.x === 32);
    expect(pixelsAtLeftEdge.length).toBeGreaterThanOrEqual(23);
  });
});
