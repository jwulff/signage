/**
 * Tests for blood sugar renderer
 */

import { describe, it, expect } from "vitest";
import { calculateTIR, classifyRange, calculateInsulinTotal } from "./blood-sugar-renderer.js";

describe("calculateTIR", () => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
  const twentyFiveHoursAgo = now - 25 * 60 * 60 * 1000;

  it("returns null for empty points array", () => {
    expect(calculateTIR([])).toBeNull();
  });

  it("returns null when all points are older than 24 hours", () => {
    const points = [
      { timestamp: twentyFiveHoursAgo, glucose: 100 },
      { timestamp: twentyFiveHoursAgo - 1000, glucose: 110 },
    ];
    expect(calculateTIR(points)).toBeNull();
  });

  it("returns 100% when all points are in range (70-180)", () => {
    const points = [
      { timestamp: oneHourAgo, glucose: 70 },
      { timestamp: oneHourAgo - 1000, glucose: 100 },
      { timestamp: oneHourAgo - 2000, glucose: 180 },
      { timestamp: twelveHoursAgo, glucose: 120 },
    ];
    expect(calculateTIR(points)).toBe(100);
  });

  it("returns 0% when no points are in range", () => {
    const points = [
      { timestamp: oneHourAgo, glucose: 69 },
      { timestamp: oneHourAgo - 1000, glucose: 181 },
      { timestamp: twelveHoursAgo, glucose: 250 },
    ];
    expect(calculateTIR(points)).toBe(0);
  });

  it("returns correct percentage for mixed values", () => {
    const points = [
      { timestamp: oneHourAgo, glucose: 100 }, // in range
      { timestamp: oneHourAgo - 1000, glucose: 150 }, // in range
      { timestamp: oneHourAgo - 2000, glucose: 50 }, // out of range (low)
      { timestamp: oneHourAgo - 3000, glucose: 200 }, // out of range (high)
    ];
    // 2 out of 4 = 50%
    expect(calculateTIR(points)).toBe(50);
  });

  it("excludes points older than 24 hours from calculation", () => {
    const points = [
      { timestamp: oneHourAgo, glucose: 100 }, // in range, included
      { timestamp: oneHourAgo - 1000, glucose: 200 }, // out of range, included
      { timestamp: twentyFiveHoursAgo, glucose: 100 }, // in range but excluded
      { timestamp: twentyFiveHoursAgo - 1000, glucose: 100 }, // in range but excluded
    ];
    // Only 1 out of 2 recent points = 50%
    expect(calculateTIR(points)).toBe(50);
  });

  it("rounds to nearest integer percentage", () => {
    const points = [
      { timestamp: oneHourAgo, glucose: 100 }, // in range
      { timestamp: oneHourAgo - 1000, glucose: 100 }, // in range
      { timestamp: oneHourAgo - 2000, glucose: 200 }, // out of range
    ];
    // 2 out of 3 = 66.67% -> rounds to 67%
    expect(calculateTIR(points)).toBe(67);
  });

  it("treats boundary values correctly (70 and 180 are in range)", () => {
    const points = [
      { timestamp: oneHourAgo, glucose: 70 }, // in range (boundary)
      { timestamp: oneHourAgo - 1000, glucose: 180 }, // in range (boundary)
    ];
    expect(calculateTIR(points)).toBe(100);
  });
});

describe("classifyRange", () => {
  it("classifies urgent low (<55)", () => {
    expect(classifyRange(54)).toBe("urgentLow");
    expect(classifyRange(40)).toBe("urgentLow");
  });

  it("classifies low (55-69)", () => {
    expect(classifyRange(55)).toBe("low");
    expect(classifyRange(69)).toBe("low");
  });

  it("classifies normal (70-180)", () => {
    expect(classifyRange(70)).toBe("normal");
    expect(classifyRange(120)).toBe("normal");
    expect(classifyRange(180)).toBe("normal");
  });

  it("classifies high (181-250)", () => {
    expect(classifyRange(181)).toBe("high");
    expect(classifyRange(250)).toBe("high");
  });

  it("classifies very high (>250)", () => {
    expect(classifyRange(251)).toBe("veryHigh");
    expect(classifyRange(400)).toBe("veryHigh");
  });
});

describe("calculateInsulinTotal", () => {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;

  it("returns 0 for empty treatments array", () => {
    expect(calculateInsulinTotal([], now - 24 * HOUR, now)).toBe(0);
  });

  it("sums only insulin treatments, ignoring carbs", () => {
    const treatments = [
      { timestamp: now - 5 * HOUR, type: "insulin" as const, value: 5 },
      { timestamp: now - 6 * HOUR, type: "carbs" as const, value: 50 },
      { timestamp: now - 7 * HOUR, type: "insulin" as const, value: 3 },
    ];
    expect(calculateInsulinTotal(treatments, now - 24 * HOUR, now)).toBe(8);
  });

  it("filters by time window (startTime inclusive, endTime exclusive)", () => {
    const treatments = [
      { timestamp: now - 25 * HOUR, type: "insulin" as const, value: 10 }, // before window
      { timestamp: now - 24 * HOUR, type: "insulin" as const, value: 5 }, // at start (included)
      { timestamp: now - 12 * HOUR, type: "insulin" as const, value: 3 }, // in window
      { timestamp: now - 3 * HOUR, type: "insulin" as const, value: 7 }, // at end (excluded)
      { timestamp: now - 1 * HOUR, type: "insulin" as const, value: 2 }, // after window
    ];
    // Window: 24h ago to 3h ago (exclusive)
    expect(calculateInsulinTotal(treatments, now - 24 * HOUR, now - 3 * HOUR)).toBe(8); // 5 + 3
  });

  it("handles fractional insulin values", () => {
    const treatments = [
      { timestamp: now - 5 * HOUR, type: "insulin" as const, value: 2.5 },
      { timestamp: now - 6 * HOUR, type: "insulin" as const, value: 1.5 },
    ];
    expect(calculateInsulinTotal(treatments, now - 24 * HOUR, now)).toBe(4);
  });

  it("returns 0 when no treatments fall within window", () => {
    const treatments = [
      { timestamp: now - 30 * HOUR, type: "insulin" as const, value: 10 },
      { timestamp: now - 1 * HOUR, type: "insulin" as const, value: 5 },
    ];
    // Window: 24h to 3h ago - neither treatment falls in this window
    expect(calculateInsulinTotal(treatments, now - 24 * HOUR, now - 3 * HOUR)).toBe(0);
  });
});
