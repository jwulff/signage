/**
 * Tests for clock renderer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSolidFrame, getPixel } from "@signage/core";
import { renderClockRegion, type ClockWeatherData } from "../clock-renderer.js";

describe("renderClockRegion", () => {
  beforeEach(() => {
    // Mock Date to ensure consistent test output
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-24T14:30:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders time text to frame", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles");

    // Time should be rendered in top region (rows 0-6)
    // Check that some pixels are set in the time area (row 4)
    let hasPixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 4);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasPixels = true;
        break;
      }
    }
    expect(hasPixels).toBe(true);
  });

  it("renders combined date and time on single row", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles");

    // Combined date+time should span most of the width at row 1
    // Format: "SAT JAN 24 2:30" (15 chars ≈ 59 pixels)
    let pixelCount = 0;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 4); // Middle of text (row 1 + 3)
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        pixelCount++;
      }
    }
    // Combined line should have more pixels than just time alone
    expect(pixelCount).toBeGreaterThan(15);
  });

  it("renders date in dim color and time in bright color", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles");

    // Scan row 4 (middle of text) for color differences
    // Date portion uses clockSecondary (100, 100, 100)
    // Time portion uses clockTime (255, 255, 255)
    let foundDimPixel = false;
    let foundBrightPixel = false;

    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 4);
      if (pixel) {
        // Dim gray (date)
        if (pixel.r === 100 && pixel.g === 100 && pixel.b === 100) {
          foundDimPixel = true;
        }
        // Bright white (time)
        if (pixel.r === 255 && pixel.g === 255 && pixel.b === 255) {
          foundBrightPixel = true;
        }
      }
    }

    expect(foundDimPixel).toBe(true);
    expect(foundBrightPixel).toBe(true);
  });

  it("accepts weather data without errors (weather band disabled in current layout)", () => {
    const frame = createSolidFrame(64, 64);
    const weather: ClockWeatherData = { tempNow: 60 };

    // Weather band is disabled in current layout to maximize chart space
    // Just verify rendering doesn't throw
    renderClockRegion(frame, "America/Los_Angeles", weather);

    // Band area should be black since weather band is disabled
    const bandPixel = getPixel(frame, 32, 16);
    expect(bandPixel).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("keeps band area empty when no weather data provided", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles"); // No weather

    // Band area should be black (background color)
    const bandPixel = getPixel(frame, 32, 16);
    expect(bandPixel).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("renders in narrow bounds (32px width)", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles", undefined, {
      startX: 32,
      endX: 63,
      startY: 0,
      endY: 31,
    });

    // Time should be rendered in right half only
    // Left side (x < 32) should be black
    const leftPixel = getPixel(frame, 10, 10);
    expect(leftPixel).toEqual({ r: 0, g: 0, b: 0 });

    // Right side should have some content
    let hasRightPixels = false;
    for (let x = 32; x < 64; x++) {
      for (let y = 0; y < 32; y++) {
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          hasRightPixels = true;
          break;
        }
      }
      if (hasRightPixels) break;
    }
    expect(hasRightPixels).toBe(true);
  });

  it("handles different timezones", () => {
    const framePacific = createSolidFrame(64, 64);
    const frameEastern = createSolidFrame(64, 64);

    renderClockRegion(framePacific, "America/Los_Angeles");
    renderClockRegion(frameEastern, "America/New_York");

    // Both should render something (not crash)
    let pacificHasPixels = false;
    let easternHasPixels = false;

    for (let x = 0; x < 64; x++) {
      const pPixel = getPixel(framePacific, x, 4);
      const ePixel = getPixel(frameEastern, x, 4);
      if (pPixel && (pPixel.r > 0 || pPixel.g > 0 || pPixel.b > 0)) {
        pacificHasPixels = true;
      }
      if (ePixel && (ePixel.r > 0 || ePixel.g > 0 || ePixel.b > 0)) {
        easternHasPixels = true;
      }
    }

    expect(pacificHasPixels).toBe(true);
    expect(easternHasPixels).toBe(true);
  });
});
