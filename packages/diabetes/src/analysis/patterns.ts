/**
 * Pattern detection for diabetes data
 */

import type { CgmReading, BolusRecord } from "../models/index.js";
import { TARGET } from "./glucose-stats.js";

/**
 * Detected pattern result
 */
export interface DetectedPattern {
  patternType: string;
  occurrences: number;
  avgTiming: string;
  severity: "mild" | "moderate" | "significant";
  suggestedAction: string;
  confidence: number; // 0-1
}

/**
 * Detect overnight low patterns
 * Looks for lows between 12am-6am over multiple days
 */
export function detectOvernightLowPattern(
  cgmReadings: CgmReading[],
  daysToAnalyze: number = 14
): DetectedPattern | null {
  const now = Date.now();
  const startTime = now - daysToAnalyze * 24 * 60 * 60 * 1000;

  // Filter to analysis window
  const readings = cgmReadings.filter((r) => r.timestamp >= startTime);

  // Group by date and find overnight lows (12am-6am)
  const overnightLowsByDate = new Map<string, number[]>();

  for (const reading of readings) {
    const date = new Date(reading.timestamp);
    const hour = date.getHours();

    // Check if overnight (12am-6am) and low
    if (hour >= 0 && hour < 6 && reading.glucoseMgDl < TARGET.LOW) {
      const dateStr = date.toISOString().split("T")[0];
      const existing = overnightLowsByDate.get(dateStr) || [];
      existing.push(hour);
      overnightLowsByDate.set(dateStr, existing);
    }
  }

  const daysWithLows = overnightLowsByDate.size;

  // Need at least 3 occurrences to be a pattern
  if (daysWithLows < 3) return null;

  // Calculate average timing
  const allHours: number[] = [];
  overnightLowsByDate.forEach((hours) => allHours.push(...hours));
  const avgHour = allHours.reduce((a, b) => a + b, 0) / allHours.length;

  // Determine severity based on frequency
  let severity: "mild" | "moderate" | "significant";
  const frequency = daysWithLows / daysToAnalyze;
  if (frequency > 0.5) severity = "significant";
  else if (frequency > 0.25) severity = "moderate";
  else severity = "mild";

  // Format timing
  const avgTiming = `${Math.floor(avgHour)}:${String(Math.round((avgHour % 1) * 60)).padStart(2, "0")}am`;

  return {
    patternType: "overnight_low",
    occurrences: daysWithLows,
    avgTiming,
    severity,
    suggestedAction: `Consider reducing basal rate by 0.05-0.1 u/hr during ${Math.floor(avgHour) - 1}-${Math.floor(avgHour) + 1}am`,
    confidence: Math.min(0.9, 0.5 + frequency),
  };
}

/**
 * Detect post-meal spike patterns
 */
export function detectPostMealSpikePattern(
  cgmReadings: CgmReading[],
  boluses: BolusRecord[],
  daysToAnalyze: number = 14
): DetectedPattern | null {
  const now = Date.now();
  const startTime = now - daysToAnalyze * 24 * 60 * 60 * 1000;

  // Filter to analysis window
  const readings = cgmReadings.filter((r) => r.timestamp >= startTime);
  const mealBoluses = boluses.filter(
    (b) => b.timestamp >= startTime && b.carbsInputGrams > 0
  );

  if (mealBoluses.length < 3) return null;

  // For each meal bolus, check glucose 1-2 hours after
  let spikeCount = 0;
  const spikeTimes: string[] = [];

  for (const bolus of mealBoluses) {
    const oneHourAfter = bolus.timestamp + 60 * 60 * 1000;
    const twoHoursAfter = bolus.timestamp + 120 * 60 * 1000;

    // Find peak glucose in 1-2 hour window
    const postMealReadings = readings.filter(
      (r) => r.timestamp >= oneHourAfter && r.timestamp <= twoHoursAfter
    );

    if (postMealReadings.length === 0) continue;

    const peakGlucose = Math.max(...postMealReadings.map((r) => r.glucoseMgDl));

    // Count as spike if peak is >180 (could be configurable)
    if (peakGlucose > TARGET.HIGH) {
      spikeCount++;
      const bolusDate = new Date(bolus.timestamp);
      const hour = bolusDate.getHours();
      if (hour >= 6 && hour < 10) spikeTimes.push("breakfast");
      else if (hour >= 11 && hour < 14) spikeTimes.push("lunch");
      else if (hour >= 17 && hour < 21) spikeTimes.push("dinner");
      else spikeTimes.push("other");
    }
  }

  const spikeRate = spikeCount / mealBoluses.length;

  // Need significant spike rate to be a pattern
  if (spikeRate < 0.3) return null;

  // Find most common meal time
  const mealCounts = spikeTimes.reduce(
    (acc, meal) => {
      acc[meal] = (acc[meal] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const dominantMeal = Object.entries(mealCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "meals";

  // Determine severity
  let severity: "mild" | "moderate" | "significant";
  if (spikeRate > 0.7) severity = "significant";
  else if (spikeRate > 0.5) severity = "moderate";
  else severity = "mild";

  return {
    patternType: "post_meal_spike",
    occurrences: spikeCount,
    avgTiming: dominantMeal,
    severity,
    suggestedAction: `Consider pre-bolusing 10-15 minutes before ${dominantMeal}`,
    confidence: Math.min(0.9, 0.4 + spikeRate),
  };
}

/**
 * Detect morning high patterns (dawn phenomenon)
 */
export function detectMorningHighPattern(
  cgmReadings: CgmReading[],
  daysToAnalyze: number = 14
): DetectedPattern | null {
  const now = Date.now();
  const startTime = now - daysToAnalyze * 24 * 60 * 60 * 1000;

  const readings = cgmReadings.filter((r) => r.timestamp >= startTime);

  // Group by date and check 5am-8am readings
  const morningHighsByDate = new Map<string, number>();

  for (const reading of readings) {
    const date = new Date(reading.timestamp);
    const hour = date.getHours();

    // Check if morning (5am-8am) and high
    if (hour >= 5 && hour < 8 && reading.glucoseMgDl > TARGET.HIGH) {
      const dateStr = date.toISOString().split("T")[0];
      const existing = morningHighsByDate.get(dateStr) || 0;
      morningHighsByDate.set(dateStr, Math.max(existing, reading.glucoseMgDl));
    }
  }

  const daysWithHighs = morningHighsByDate.size;

  if (daysWithHighs < 3) return null;

  const frequency = daysWithHighs / daysToAnalyze;

  let severity: "mild" | "moderate" | "significant";
  if (frequency > 0.5) severity = "significant";
  else if (frequency > 0.25) severity = "moderate";
  else severity = "mild";

  return {
    patternType: "morning_high",
    occurrences: daysWithHighs,
    avgTiming: "5-8am",
    severity,
    suggestedAction: "Consider increasing basal rate by 0.05-0.1 u/hr from 3-6am",
    confidence: Math.min(0.9, 0.5 + frequency),
  };
}

/**
 * Run all pattern detection and return findings
 */
export function detectAllPatterns(
  cgmReadings: CgmReading[],
  boluses: BolusRecord[],
  daysToAnalyze: number = 14
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const overnightLow = detectOvernightLowPattern(cgmReadings, daysToAnalyze);
  if (overnightLow) patterns.push(overnightLow);

  const postMealSpike = detectPostMealSpikePattern(cgmReadings, boluses, daysToAnalyze);
  if (postMealSpike) patterns.push(postMealSpike);

  const morningHigh = detectMorningHighPattern(cgmReadings, daysToAnalyze);
  if (morningHigh) patterns.push(morningHigh);

  // Sort by severity (significant first)
  const severityOrder = { significant: 0, moderate: 1, mild: 2 };
  patterns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return patterns;
}
