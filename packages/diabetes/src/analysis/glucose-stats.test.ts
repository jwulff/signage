/**
 * Tests for glucose statistics calculations
 */

import { describe, it, expect } from "vitest";
import {
  calculateGlucoseStats,
  calculateTimeInRange,
  classifyGlucose,
  calculateTrend,
} from "./glucose-stats.js";

describe("calculateGlucoseStats", () => {
  it("returns zeros for empty array", () => {
    const stats = calculateGlucoseStats([]);
    expect(stats.readingCount).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.tir).toBe(0);
  });

  it("calculates correct stats for in-range readings", () => {
    const readings = [
      { glucoseMgDl: 100 },
      { glucoseMgDl: 110 },
      { glucoseMgDl: 120 },
      { glucoseMgDl: 130 },
      { glucoseMgDl: 140 },
    ];

    const stats = calculateGlucoseStats(readings);

    expect(stats.readingCount).toBe(5);
    expect(stats.mean).toBe(120);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(140);
    expect(stats.tir).toBe(100); // All in range
    expect(stats.tbr).toBe(0); // None below
    expect(stats.tar).toBe(0); // None above
  });

  it("calculates correct TBR and TAR", () => {
    const readings = [
      { glucoseMgDl: 50 }, // Below range
      { glucoseMgDl: 65 }, // Below range
      { glucoseMgDl: 100 }, // In range
      { glucoseMgDl: 150 }, // In range
      { glucoseMgDl: 200 }, // Above range
    ];

    const stats = calculateGlucoseStats(readings);

    expect(stats.readingCount).toBe(5);
    expect(stats.tbr).toBe(40); // 2/5 = 40%
    expect(stats.tir).toBe(40); // 2/5 = 40%
    expect(stats.tar).toBe(20); // 1/5 = 20%
  });

  it("calculates coefficient of variation", () => {
    const readings = [
      { glucoseMgDl: 100 },
      { glucoseMgDl: 100 },
      { glucoseMgDl: 100 },
    ];

    const stats = calculateGlucoseStats(readings);

    expect(stats.cv).toBe(0); // No variation
    expect(stats.stdDev).toBe(0);
  });
});

describe("calculateTimeInRange", () => {
  it("returns 0 for empty array", () => {
    expect(calculateTimeInRange([])).toBe(0);
  });

  it("returns 100 when all in range", () => {
    const readings = [{ glucoseMgDl: 100 }, { glucoseMgDl: 120 }];
    expect(calculateTimeInRange(readings)).toBe(100);
  });

  it("respects custom thresholds", () => {
    const readings = [
      { glucoseMgDl: 80 },
      { glucoseMgDl: 100 },
      { glucoseMgDl: 120 },
    ];

    // With default range (70-180), all should be in range
    expect(calculateTimeInRange(readings)).toBe(100);

    // With tighter range (90-110), only 1 should be in range
    expect(calculateTimeInRange(readings, 90, 110)).toBeCloseTo(33.3, 0);
  });
});

describe("classifyGlucose", () => {
  it("classifies urgent low correctly", () => {
    expect(classifyGlucose(40)).toBe("urgent_low");
    expect(classifyGlucose(53)).toBe("urgent_low");
  });

  it("classifies low correctly", () => {
    expect(classifyGlucose(54)).toBe("low");
    expect(classifyGlucose(69)).toBe("low");
  });

  it("classifies normal correctly", () => {
    expect(classifyGlucose(70)).toBe("normal");
    expect(classifyGlucose(120)).toBe("normal");
    expect(classifyGlucose(180)).toBe("normal");
  });

  it("classifies high correctly", () => {
    expect(classifyGlucose(181)).toBe("high");
    expect(classifyGlucose(250)).toBe("high");
  });

  it("classifies very high correctly", () => {
    expect(classifyGlucose(251)).toBe("very_high");
    expect(classifyGlucose(400)).toBe("very_high");
  });
});

describe("calculateTrend", () => {
  it("returns stable for single reading", () => {
    const readings = [{ timestamp: Date.now(), glucoseMgDl: 100 }];
    const trend = calculateTrend(readings);
    expect(trend.direction).toBe("stable");
    expect(trend.ratePerMinute).toBe(0);
  });

  it("detects rising trend", () => {
    const now = Date.now();
    const readings = [
      { timestamp: now - 10 * 60 * 1000, glucoseMgDl: 100 },
      { timestamp: now, glucoseMgDl: 130 },
    ];
    const trend = calculateTrend(readings);
    expect(trend.direction).toBe("rising");
    expect(trend.ratePerMinute).toBeGreaterThan(1);
  });

  it("detects falling trend", () => {
    const now = Date.now();
    const readings = [
      { timestamp: now - 10 * 60 * 1000, glucoseMgDl: 130 },
      { timestamp: now, glucoseMgDl: 100 },
    ];
    const trend = calculateTrend(readings);
    expect(trend.direction).toBe("falling");
    expect(trend.ratePerMinute).toBeLessThan(-1);
  });

  it("detects stable trend with small changes", () => {
    const now = Date.now();
    const readings = [
      { timestamp: now - 10 * 60 * 1000, glucoseMgDl: 100 },
      { timestamp: now, glucoseMgDl: 105 },
    ];
    const trend = calculateTrend(readings);
    expect(trend.direction).toBe("stable");
  });
});
