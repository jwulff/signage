/**
 * Clock region renderer
 */

import type { Frame } from "@signage/core";
import { setPixel } from "@signage/core";
import { drawText, drawTinyText, measureText, DISPLAY_WIDTH } from "./text.js";
import { COLORS } from "./colors.js";

// Clock region boundaries (default full width)
const CLOCK_REGION_START_Y = 0;
const CLOCK_REGION_END_Y = 31;

/**
 * Region bounds for clock rendering
 */
export interface ClockRegionBounds {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

// Sunlight band configuration (compact layout)
const BAND_Y = 13; // Start row for the band (moved up from 18)
const BAND_HEIGHT = 8; // Height of the sunlight band
const BAND_MARGIN = 1; // Left/right margin

/**
 * Hourly weather conditions
 */
export interface HourlyCondition {
  temp?: number;
  cloudCover?: number;      // 0-100 percentage
  precipitation?: number;   // mm of rain/snow
  isSnow?: boolean;         // true if precipitation is snow
}

/**
 * Weather data for the clock display
 * Contains 48 hours of data (24 hours back, 24 hours forward from midnight)
 */
export interface ClockWeatherData {
  // Temperatures in Fahrenheit at 5 time points (legacy, for compatibility)
  tempMinus12h?: number;
  tempMinus6h?: number;
  tempNow?: number;
  tempPlus6h?: number;
  tempPlus12h?: number;
  // Full hourly data for gradient rendering (index 0 = midnight today)
  hourlyConditions?: HourlyCondition[];
  // Current hour index in the hourlyConditions array
  currentHourIndex?: number;
}

/**
 * Calculate sunlight percentage for a given hour (0-23)
 * Uses cosine curve: peaks at noon (100%), bottoms at midnight (0%)
 */
function getSunlightPercent(hour: number): number {
  return (1 + Math.cos((hour - 12) * Math.PI / 12)) / 2;
}

/**
 * Calculate center X position within a bounded region
 */
function centerXInBounds(text: string, startX: number, endX: number): number {
  const regionWidth = endX - startX + 1;
  const textWidth = measureText(text);
  return startX + Math.floor((regionWidth - textWidth) / 2);
}

/**
 * Render clock widget to top region of frame
 * Supports optional bounds for rendering in a constrained region (e.g., right half)
 */
export function renderClockRegion(
  frame: Frame,
  timezone = "America/Los_Angeles",
  weather?: ClockWeatherData,
  bounds?: ClockRegionBounds
): void {
  const now = new Date();
  const localTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  let hours = localTime.getHours();
  const currentHour24 = hours; // Save for sunlight calc
  hours = hours % 12 || 12;
  const minutes = String(localTime.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Default bounds (full width top region)
  const startX = bounds?.startX ?? 0;
  const endX = bounds?.endX ?? DISPLAY_WIDTH - 1;
  const startY = bounds?.startY ?? CLOCK_REGION_START_Y;
  const endY = bounds?.endY ?? CLOCK_REGION_END_Y;
  const regionWidth = endX - startX + 1;

  // Narrow region (32px or less) - simplified clock without sunlight band
  if (regionWidth <= 32) {
    // Center time horizontally within the region
    const timeX = centerXInBounds(timeStr, startX, endX);

    // Vertically center within the region
    const regionHeight = endY - startY + 1;
    const timeY = startY + Math.floor((regionHeight - 10) / 2); // 10px approx text height

    drawText(frame, timeStr, timeX, timeY, COLORS.clockTime, startY, endY);
    return;
  }

  // Full-width region - compact layout with sunlight band
  // Combined date and time on single row: "SAT JAN 24 11:09"
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const dayName = days[localTime.getDay()];
  const monthName = months[localTime.getMonth()];
  const dayNum = localTime.getDate();
  const dateStr = `${dayName} ${monthName} ${dayNum} `;
  const dateTimeStr = `${dateStr}${timeStr}`;

  // Draw date (dimmer) and time (brighter) with different colors
  const dateTimeX = centerXInBounds(dateTimeStr, startX, endX);
  const dateWidth = measureText(dateStr);
  drawText(frame, dateStr, dateTimeX, startY + 1, COLORS.clockAmPm, startY, endY);
  drawText(frame, timeStr, dateTimeX + dateWidth + 1, startY + 1, COLORS.clockTime, startY, endY);

  // Sunlight gradient band with temperature overlay
  renderSunlightBand(frame, currentHour24, weather, startX, endX);
}

/**
 * Get condition data for a specific hour offset from now
 */
function getConditionAtOffset(
  weather: ClockWeatherData | undefined,
  hoursOffset: number
): HourlyCondition | undefined {
  if (!weather?.hourlyConditions || weather.currentHourIndex === undefined) {
    return undefined;
  }
  const idx = weather.currentHourIndex + Math.round(hoursOffset);
  if (idx >= 0 && idx < weather.hourlyConditions.length) {
    return weather.hourlyConditions[idx];
  }
  return undefined;
}

/**
 * Render the 24-hour sunlight gradient band with temperature overlay
 * Left edge = 12 hours ago, center = now, right edge = 12 hours from now
 * Tints gradient by cloud cover and adds precipitation strip at bottom
 */
function renderSunlightBand(
  frame: Frame,
  currentHour24: number,
  weather?: ClockWeatherData,
  regionStartX = 0,
  regionEndX = DISPLAY_WIDTH - 1
): void {
  const regionWidth = regionEndX - regionStartX + 1;
  const bandWidth = regionWidth - BAND_MARGIN * 2;
  const bandX = regionStartX + BAND_MARGIN;
  const precipRowY = BAND_Y + BAND_HEIGHT - 1; // Bottom row for precipitation

  // Draw sunlight gradient with condition tinting
  for (let px = 0; px < bandWidth; px++) {
    // Map pixel position to hours offset from now (-12 to +12)
    const hoursOffset = ((px / (bandWidth - 1)) - 0.5) * 24;
    const hour = (currentHour24 + hoursOffset + 24) % 24;

    // Get sunlight percentage
    const sunlight = getSunlightPercent(hour);

    // Base color: dark blue (night) to light yellow (day)
    let r = Math.round(20 + sunlight * 180); // 20-200
    let g = Math.round(20 + sunlight * 160); // 20-180
    let b = Math.round(40 + (1 - sunlight) * 80); // 40-120 (more blue at night)

    // Get conditions for this hour and apply tinting
    const condition = getConditionAtOffset(weather, hoursOffset);
    if (condition) {
      // Cloud cover dims the brightness
      if (condition.cloudCover !== undefined) {
        const cloudDim = condition.cloudCover / 100; // 0-1
        const dimFactor = 1 - cloudDim * 0.5; // Reduce brightness up to 50%
        r = Math.round(r * dimFactor);
        g = Math.round(g * dimFactor);
        b = Math.round(b * dimFactor);
        // Add slight gray tint for heavy clouds
        if (cloudDim > 0.7) {
          const grayAdd = Math.round((cloudDim - 0.7) * 30);
          r = Math.min(255, r + grayAdd);
          g = Math.min(255, g + grayAdd);
          b = Math.min(255, b + grayAdd);
        }
      }

      // Rain adds blue tint
      if (condition.precipitation && condition.precipitation > 0 && !condition.isSnow) {
        const rainIntensity = Math.min(1, condition.precipitation / 5); // Cap at 5mm
        b = Math.min(255, b + Math.round(rainIntensity * 80));
        r = Math.round(r * (1 - rainIntensity * 0.3));
      }

      // Snow adds white/cyan tint
      if (condition.precipitation && condition.precipitation > 0 && condition.isSnow) {
        const snowIntensity = Math.min(1, condition.precipitation / 5);
        r = Math.min(255, r + Math.round(snowIntensity * 60));
        g = Math.min(255, g + Math.round(snowIntensity * 60));
        b = Math.min(255, b + Math.round(snowIntensity * 80));
      }
    }

    // Draw vertical strip (leaving bottom row for precipitation)
    for (let py = BAND_Y; py < precipRowY; py++) {
      setPixel(frame, bandX + px, py, { r, g, b });
    }

    // Draw precipitation indicator on bottom row
    if (condition?.precipitation && condition.precipitation > 0) {
      const intensity = Math.min(1, condition.precipitation / 5);
      if (condition.isSnow) {
        // Snow: white
        const brightness = Math.round(100 + intensity * 155);
        setPixel(frame, bandX + px, precipRowY, { r: brightness, g: brightness, b: brightness });
      } else {
        // Rain: blue
        const brightness = Math.round(80 + intensity * 175);
        setPixel(frame, bandX + px, precipRowY, { r: 20, g: 40, b: brightness });
      }
    } else {
      // No precipitation: very dark (almost invisible)
      setPixel(frame, bandX + px, precipRowY, { r: 10, g: 10, b: 15 });
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

    const tempY = BAND_Y + 1; // Move up slightly to avoid precip row

    for (const { offset, temp } of temps) {
      if (temp !== undefined) {
        const tempStr = `${Math.round(temp)}`;
        const tempWidth = tempStr.length * 4; // Tiny font is ~3px + 1px spacing
        let tempX = bandX + Math.round(offset * (bandWidth - 1)) - Math.floor(tempWidth / 2);

        // Clamp to stay within band
        tempX = Math.max(bandX, Math.min(tempX, bandX + bandWidth - tempWidth));

        // Draw with dark outline for readability
        drawTinyText(frame, tempStr, tempX, tempY + 1, { r: 0, g: 0, b: 0 }); // Shadow
        drawTinyText(frame, tempStr, tempX, tempY, { r: 255, g: 255, b: 255 });
      }
    }
  }
}
