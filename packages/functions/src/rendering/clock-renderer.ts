/**
 * Clock region renderer
 */

import type { Frame } from "@signage/core";
import { setPixel } from "@signage/core";
import { drawText, drawTinyText, centerX, DISPLAY_WIDTH } from "./text.js";
import { COLORS } from "./colors.js";

// Clock region boundaries
const CLOCK_REGION_START = 0;
const CLOCK_REGION_END = 31;

// Sunlight band configuration
const BAND_Y = 18; // Start row for the band
const BAND_HEIGHT = 8; // Height of the sunlight band
const BAND_MARGIN = 1; // Left/right margin

/**
 * Weather data for the clock display
 */
export interface ClockWeatherData {
  // Temperatures in Fahrenheit at 5 time points
  tempMinus12h?: number;
  tempMinus6h?: number;
  tempNow?: number;
  tempPlus6h?: number;
  tempPlus12h?: number;
}

/**
 * Calculate sunlight percentage for a given hour (0-23)
 * Uses cosine curve: peaks at noon (100%), bottoms at midnight (0%)
 */
function getSunlightPercent(hour: number): number {
  return (1 + Math.cos((hour - 12) * Math.PI / 12)) / 2;
}

/**
 * Render clock widget to top region of frame
 */
export function renderClockRegion(
  frame: Frame,
  timezone = "America/Los_Angeles",
  weather?: ClockWeatherData
): void {
  const now = new Date();
  const localTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  let hours = localTime.getHours();
  const currentHour24 = hours; // Save for sunlight calc
  hours = hours % 12 || 12;
  const minutes = String(localTime.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Row 4: Time (larger, centered)
  drawText(frame, timeStr, centerX(timeStr), 4, COLORS.clockTime, CLOCK_REGION_START, CLOCK_REGION_END);

  // Rows 18-25: Sunlight gradient band with temperature overlay
  renderSunlightBand(frame, currentHour24, weather);
}

/**
 * Render the 24-hour sunlight gradient band with temperature overlay
 * Left edge = 12 hours ago, center = now, right edge = 12 hours from now
 */
function renderSunlightBand(
  frame: Frame,
  currentHour24: number,
  weather?: ClockWeatherData
): void {
  const bandWidth = DISPLAY_WIDTH - BAND_MARGIN * 2;
  const bandX = BAND_MARGIN;

  // Draw sunlight gradient
  for (let px = 0; px < bandWidth; px++) {
    // Map pixel position to hours offset from now (-12 to +12)
    const hoursOffset = ((px / (bandWidth - 1)) - 0.5) * 24;
    const hour = (currentHour24 + hoursOffset + 24) % 24;

    // Get sunlight percentage and calculate brightness
    const sunlight = getSunlightPercent(hour);

    // Color: dark blue (night) to light yellow (day)
    const r = Math.round(20 + sunlight * 180); // 20-200
    const g = Math.round(20 + sunlight * 160); // 20-180
    const b = Math.round(40 + (1 - sunlight) * 80); // 40-120 (more blue at night)

    // Draw vertical strip
    for (let py = BAND_Y; py < BAND_Y + BAND_HEIGHT; py++) {
      setPixel(frame, bandX + px, py, { r, g, b });
    }
  }

  // Draw center line (now indicator) - subtle
  const centerX = bandX + Math.floor(bandWidth / 2);
  for (let py = BAND_Y; py < BAND_Y + BAND_HEIGHT; py++) {
    setPixel(frame, centerX, py, { r: 255, g: 255, b: 255 });
  }

  // Overlay temperatures if available
  if (weather) {
    const temps = [
      { offset: 0, temp: weather.tempMinus12h },      // Left edge
      { offset: 0.25, temp: weather.tempMinus6h },    // 1/4 from left
      { offset: 0.5, temp: weather.tempNow },         // Center
      { offset: 0.75, temp: weather.tempPlus6h },     // 3/4 from left
      { offset: 1, temp: weather.tempPlus12h },       // Right edge
    ];

    const tempY = BAND_Y + 2; // Center temps in band

    for (const { offset, temp } of temps) {
      if (temp !== undefined) {
        const tempStr = `${Math.round(temp)}`;
        const tempWidth = tempStr.length * 4; // Tiny font is ~3px + 1px spacing
        let tempX = bandX + Math.round(offset * (bandWidth - 1)) - Math.floor(tempWidth / 2);

        // Clamp to stay within band
        tempX = Math.max(bandX, Math.min(tempX, bandX + bandWidth - tempWidth));

        // Draw with dark outline for readability
        drawTinyText(frame, tempStr, tempX, tempY, { r: 0, g: 0, b: 0 }); // Shadow
        drawTinyText(frame, tempStr, tempX, tempY - 1, { r: 255, g: 255, b: 255 });
      }
    }
  }
}
