/**
 * Glucose statistical analysis functions
 */

import type { CgmReading, BgReading, GlucoseReading } from "../models/index.js";

/**
 * Target range constants (mg/dL)
 */
export const TARGET = {
  LOW: 70,
  HIGH: 180,
  URGENT_LOW: 54,
  VERY_HIGH: 250,
} as const;

/**
 * Glucose statistics result
 */
export interface GlucoseStats {
  /** Minimum glucose value */
  min: number;
  /** Maximum glucose value */
  max: number;
  /** Mean glucose value */
  mean: number;
  /** Standard deviation */
  stdDev: number;
  /** Coefficient of variation (stdDev/mean * 100) */
  cv: number;
  /** Time in range percentage (70-180 mg/dL) */
  tir: number;
  /** Time below range percentage (<70 mg/dL) */
  tbr: number;
  /** Time above range percentage (>180 mg/dL) */
  tar: number;
  /** Time in tight range percentage (70-140 mg/dL) */
  titr: number;
  /** Number of readings analyzed */
  readingCount: number;
  /** Estimated A1C from mean glucose */
  estimatedA1c: number;
  /** Glucose Management Indicator (GMI) */
  gmi: number;
}

/**
 * Calculate glucose statistics from readings
 */
export function calculateGlucoseStats(
  readings: Array<CgmReading | BgReading | { glucoseMgDl: number }>
): GlucoseStats {
  if (readings.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      stdDev: 0,
      cv: 0,
      tir: 0,
      tbr: 0,
      tar: 0,
      titr: 0,
      readingCount: 0,
      estimatedA1c: 0,
      gmi: 0,
    };
  }

  const values = readings.map((r) => r.glucoseMgDl);
  const n = values.length;

  // Basic stats
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Standard deviation
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(avgSquaredDiff);

  // Coefficient of variation
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

  // Time in range calculations
  const inRange = values.filter((v) => v >= TARGET.LOW && v <= TARGET.HIGH).length;
  const belowRange = values.filter((v) => v < TARGET.LOW).length;
  const aboveRange = values.filter((v) => v > TARGET.HIGH).length;
  const inTightRange = values.filter((v) => v >= TARGET.LOW && v <= 140).length;

  const tir = (inRange / n) * 100;
  const tbr = (belowRange / n) * 100;
  const tar = (aboveRange / n) * 100;
  const titr = (inTightRange / n) * 100;

  // Estimated A1C using ADAG formula: A1C = (mean + 46.7) / 28.7
  const estimatedA1c = (mean + 46.7) / 28.7;

  // GMI (Glucose Management Indicator) = 3.31 + (0.02392 × mean glucose in mg/dL)
  const gmi = 3.31 + 0.02392 * mean;

  return {
    min: Math.round(min),
    max: Math.round(max),
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    cv: Math.round(cv * 10) / 10,
    tir: Math.round(tir * 10) / 10,
    tbr: Math.round(tbr * 10) / 10,
    tar: Math.round(tar * 10) / 10,
    titr: Math.round(titr * 10) / 10,
    readingCount: n,
    estimatedA1c: Math.round(estimatedA1c * 10) / 10,
    gmi: Math.round(gmi * 10) / 10,
  };
}

/**
 * Calculate time in range for a specific period
 */
export function calculateTimeInRange(
  readings: Array<{ glucoseMgDl: number }>,
  lowThreshold: number = TARGET.LOW,
  highThreshold: number = TARGET.HIGH
): number {
  if (readings.length === 0) return 0;

  const inRange = readings.filter(
    (r) => r.glucoseMgDl >= lowThreshold && r.glucoseMgDl <= highThreshold
  ).length;

  return Math.round((inRange / readings.length) * 1000) / 10;
}

/**
 * Classify a glucose value
 */
export function classifyGlucose(
  value: number
): "urgent_low" | "low" | "normal" | "high" | "very_high" {
  if (value < TARGET.URGENT_LOW) return "urgent_low";
  if (value < TARGET.LOW) return "low";
  if (value <= TARGET.HIGH) return "normal";
  if (value <= TARGET.VERY_HIGH) return "high";
  return "very_high";
}

/**
 * Determine glucose trend from recent readings
 */
export function calculateTrend(
  readings: Array<{ timestamp: number; glucoseMgDl: number }>,
  windowMinutes: number = 15
): { direction: "rising" | "falling" | "stable"; ratePerMinute: number } {
  if (readings.length < 2) {
    return { direction: "stable", ratePerMinute: 0 };
  }

  // Sort by timestamp, most recent first
  const sorted = [...readings].sort((a, b) => b.timestamp - a.timestamp);

  // Get readings within the window
  const now = sorted[0].timestamp;
  const windowStart = now - windowMinutes * 60 * 1000;
  const windowReadings = sorted.filter((r) => r.timestamp >= windowStart);

  if (windowReadings.length < 2) {
    return { direction: "stable", ratePerMinute: 0 };
  }

  // Calculate rate of change (mg/dL per minute)
  const newest = windowReadings[0];
  const oldest = windowReadings[windowReadings.length - 1];
  const timeDiffMinutes = (newest.timestamp - oldest.timestamp) / (60 * 1000);
  const glucoseDiff = newest.glucoseMgDl - oldest.glucoseMgDl;

  if (timeDiffMinutes === 0) {
    return { direction: "stable", ratePerMinute: 0 };
  }

  const ratePerMinute = glucoseDiff / timeDiffMinutes;

  // Thresholds: rising if >1 mg/dL/min, falling if <-1 mg/dL/min
  let direction: "rising" | "falling" | "stable";
  if (ratePerMinute > 1) direction = "rising";
  else if (ratePerMinute < -1) direction = "falling";
  else direction = "stable";

  return {
    direction,
    ratePerMinute: Math.round(ratePerMinute * 10) / 10,
  };
}
