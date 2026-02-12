/**
 * Tests for timezone-aware helper functions in keys.ts
 */

import { describe, it, expect } from "vitest";
import { getHourInTimezone, getCurrentLocalTime, formatDateInTimezone, getStartOfDayInTimezone } from "./keys.js";

describe("getHourInTimezone", () => {
  it("returns Pacific hour for a known UTC timestamp", () => {
    // 2026-02-07 20:00:00 UTC = 2026-02-07 12:00:00 PST (UTC-8)
    const utcNoon = Date.UTC(2026, 1, 7, 20, 0, 0);
    const hour = getHourInTimezone(utcNoon);
    expect(hour).toBe(12);
  });

  it("returns 0 for Pacific midnight", () => {
    // Pacific midnight = 08:00 UTC (during PST)
    const pacificMidnight = Date.UTC(2026, 1, 7, 8, 0, 0);
    const hour = getHourInTimezone(pacificMidnight);
    expect(hour).toBe(0);
  });

  it("handles UTC midnight correctly (4pm or 5pm Pacific previous day)", () => {
    // 2026-02-07 00:00:00 UTC = 2026-02-06 16:00:00 PST (UTC-8)
    const utcMidnight = Date.UTC(2026, 1, 7, 0, 0, 0);
    const hour = getHourInTimezone(utcMidnight);
    expect(hour).toBe(16);
  });

  it("handles PDT (summer) correctly", () => {
    // 2026-07-15 19:00:00 UTC = 2026-07-15 12:00:00 PDT (UTC-7)
    const utcNoonPDT = Date.UTC(2026, 6, 15, 19, 0, 0);
    const hour = getHourInTimezone(utcNoonPDT);
    expect(hour).toBe(12);
  });

  it("accepts custom timezone", () => {
    // 2026-02-07 17:00:00 UTC = 2026-02-07 12:00:00 EST (UTC-5)
    const utcNoonEST = Date.UTC(2026, 1, 7, 17, 0, 0);
    const hour = getHourInTimezone(utcNoonEST, "America/New_York");
    expect(hour).toBe(12);
  });
});

describe("getCurrentLocalTime", () => {
  it("returns a string with day and time components", () => {
    const result = getCurrentLocalTime();
    // Should contain a day name and a time with AM/PM
    expect(result).toMatch(/\w+day/i); // Contains a day name
    expect(result).toMatch(/\d{1,2}:\d{2}/); // Contains time
    expect(result).toMatch(/[AP]M/i); // Contains AM or PM
  });

  it("accepts custom timezone", () => {
    const result = getCurrentLocalTime("America/New_York");
    expect(result).toMatch(/\w+day/i);
    expect(result).toMatch(/[AP]M/i);
  });
});

describe("formatDateInTimezone (existing, regression)", () => {
  it("formats a UTC timestamp as Pacific date", () => {
    // 2026-02-07 03:00:00 UTC = 2026-02-06 19:00:00 PST
    // So the Pacific date should be Feb 6, not Feb 7
    const ts = Date.UTC(2026, 1, 7, 3, 0, 0);
    const date = formatDateInTimezone(ts);
    expect(date).toBe("2026-02-06");
  });
});

describe("getStartOfDayInTimezone", () => {
  it("returns Pacific midnight for a PST date", () => {
    // 2026-02-07 midnight PST = 2026-02-07 08:00:00 UTC
    const midnight = getStartOfDayInTimezone("2026-02-07");
    const expectedUtc = Date.UTC(2026, 1, 7, 8, 0, 0);
    // Binary search is within 1 second
    expect(Math.abs(midnight - expectedUtc)).toBeLessThan(1000);
  });

  it("returns Pacific midnight for a PDT date", () => {
    // 2026-07-15 midnight PDT = 2026-07-15 07:00:00 UTC
    const midnight = getStartOfDayInTimezone("2026-07-15");
    const expectedUtc = Date.UTC(2026, 6, 15, 7, 0, 0);
    expect(Math.abs(midnight - expectedUtc)).toBeLessThan(1000);
  });

  it("round-trips correctly with formatDateInTimezone", () => {
    // This is the exact bug the PR feedback identified:
    // formatDateInTimezone(Date.now()) produces a Pacific date string,
    // then getStartOfDayInTimezone should parse it back to the correct day
    const dateStr = "2026-02-07";
    const startOfDay = getStartOfDayInTimezone(dateStr);
    const roundTripped = formatDateInTimezone(startOfDay);
    expect(roundTripped).toBe(dateStr);
  });

  it("avoids the new Date() UTC midnight bug", () => {
    // new Date("2026-02-07") gives UTC midnight = Feb 6 4pm PST
    // getStartOfDayInTimezone should give Feb 7 midnight PST instead
    const dateStr = "2026-02-07";
    const buggyParse = new Date(dateStr).getTime(); // UTC midnight
    const correctParse = getStartOfDayInTimezone(dateStr); // PST midnight

    // The buggy parse would be Feb 6 in Pacific time
    expect(formatDateInTimezone(buggyParse)).toBe("2026-02-06"); // wrong day!
    // The correct parse stays on Feb 7
    expect(formatDateInTimezone(correctParse)).toBe("2026-02-07"); // right day
  });
});
