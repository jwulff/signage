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

    // Time should be rendered in top region (rows 0-31)
    // Check that some pixels are set in the time area (row 2)
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

  it("renders date text below time", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles");

    // Date should be rendered around row 7 (compact layout)
    let hasDatePixels = false;
    for (let x = 0; x < 64; x++) {
      const pixel = getPixel(frame, x, 8);
      if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
        hasDatePixels = true;
        break;
      }
    }
    expect(hasDatePixels).toBe(true);
  });

  it("renders sunlight band", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles");

    // Sunlight band is at rows 13-20 (compact layout)
    // Check center column for band pixels
    const bandPixel = getPixel(frame, 32, 16);
    expect(bandPixel).not.toBeNull();
    // Should have some color (not black)
    expect(bandPixel!.r + bandPixel!.g + bandPixel!.b).toBeGreaterThan(0);
  });

  it("renders center line (now indicator) in white", () => {
    const frame = createSolidFrame(64, 64);
    renderClockRegion(frame, "America/Los_Angeles");

    // Center line should be white at center of band
    const centerX = 32;
    const bandY = 16; // Compact layout band
    const pixel = getPixel(frame, centerX, bandY);
    expect(pixel).toEqual({ r: 255, g: 255, b: 255 });
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

  it("renders temperature overlay when weather data provided", () => {
    const frame = createSolidFrame(64, 64);
    const weather: ClockWeatherData = {
      tempMinus12h: 50,
      tempMinus6h: 55,
      tempNow: 60,
      tempPlus6h: 65,
      tempPlus12h: 58,
    };
    renderClockRegion(frame, "America/Los_Angeles", weather);

    // Temperature text should be visible in the band area
    // The band with temps should have more varied pixels than without
    let nonBlackPixels = 0;
    for (let x = 0; x < 64; x++) {
      for (let y = 13; y < 21; y++) { // Compact layout band rows
        const pixel = getPixel(frame, x, y);
        if (pixel && (pixel.r > 0 || pixel.g > 0 || pixel.b > 0)) {
          nonBlackPixels++;
        }
      }
    }
    // With weather, should have more content
    expect(nonBlackPixels).toBeGreaterThan(50);
  });

  it("applies cloud cover dimming to sunlight band", () => {
    const frameNoCloud = createSolidFrame(64, 64);
    const frameCloudy = createSolidFrame(64, 64);

    const clearWeather: ClockWeatherData = {
      tempNow: 60,
      currentHourIndex: 12,
      hourlyConditions: Array(48).fill({ cloudCover: 0 }),
    };

    const cloudyWeather: ClockWeatherData = {
      tempNow: 60,
      currentHourIndex: 12,
      hourlyConditions: Array(48).fill({ cloudCover: 100 }),
    };

    renderClockRegion(frameNoCloud, "America/Los_Angeles", clearWeather);
    renderClockRegion(frameCloudy, "America/Los_Angeles", cloudyWeather);

    // Compare brightness at a band position (compact layout)
    // Cloudy should be dimmer
    const clearPixel = getPixel(frameNoCloud, 20, 16);
    const cloudyPixel = getPixel(frameCloudy, 20, 16);

    expect(clearPixel).not.toBeNull();
    expect(cloudyPixel).not.toBeNull();

    const clearBrightness = clearPixel!.r + clearPixel!.g + clearPixel!.b;
    const cloudyBrightness = cloudyPixel!.r + cloudyPixel!.g + cloudyPixel!.b;

    // Cloudy should be dimmer (or equal if both are very dark)
    expect(cloudyBrightness).toBeLessThanOrEqual(clearBrightness);
  });

  it("shows precipitation indicator on bottom row of band", () => {
    const frame = createSolidFrame(64, 64);
    const rainyWeather: ClockWeatherData = {
      tempNow: 60,
      currentHourIndex: 12,
      hourlyConditions: Array(48).fill({
        precipitation: 5,
        isSnow: false,
      }),
    };

    renderClockRegion(frame, "America/Los_Angeles", rainyWeather);

    // Bottom row of band (row 20, compact layout) should have rain indicator (blue)
    const precipPixel = getPixel(frame, 20, 20);
    expect(precipPixel).not.toBeNull();
    // Rain should have blue component
    expect(precipPixel!.b).toBeGreaterThan(precipPixel!.r);
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
