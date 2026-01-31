/**
 * Daily aggregation computation
 */

import type { CgmReading, BolusRecord, BasalRecord, DailyInsulinSummary } from "../models/index.js";
import type { DailyAggregation } from "../storage/index.js";
import { calculateGlucoseStats, TARGET } from "../analysis/index.js";

/**
 * Compute a daily aggregation from raw records
 */
export function computeDailyAggregation(
  date: string,
  cgmReadings: CgmReading[],
  boluses: BolusRecord[],
  basals: BasalRecord[],
  dailyInsulin?: DailyInsulinSummary
): DailyAggregation {
  // Glucose stats
  const glucoseStats = calculateGlucoseStats(cgmReadings);

  // Insulin totals (prefer daily summary if available, otherwise calculate from records)
  let totalBolus = dailyInsulin?.totalBolusUnits ?? 0;
  let totalBasal = dailyInsulin?.totalBasalUnits ?? 0;

  if (!dailyInsulin) {
    totalBolus = boluses.reduce((sum, b) => sum + b.insulinDeliveredUnits, 0);
    totalBasal = basals.reduce((sum, b) => sum + (b.insulinDeliveredUnits ?? 0), 0);
  }

  const bolusCount = boluses.length;

  // Meal analysis
  const mealBoluses = boluses.filter((b) => b.carbsInputGrams > 0);
  const mealCount = mealBoluses.length;
  const avgCarbsPerMeal = mealCount > 0
    ? mealBoluses.reduce((sum, b) => sum + b.carbsInputGrams, 0) / mealCount
    : 0;

  // Calculate post-meal spikes
  let postMealSpikeSum = 0;
  let spikeCount = 0;

  for (const bolus of mealBoluses) {
    const oneHourAfter = bolus.timestamp + 60 * 60 * 1000;
    const twoHoursAfter = bolus.timestamp + 120 * 60 * 1000;

    const postMealReadings = cgmReadings.filter(
      (r) => r.timestamp >= oneHourAfter && r.timestamp <= twoHoursAfter
    );

    if (postMealReadings.length > 0) {
      const peak = Math.max(...postMealReadings.map((r) => r.glucoseMgDl));
      const preMeal = bolus.bgInputMgDl > 0 ? bolus.bgInputMgDl : 100; // Default if not entered
      postMealSpikeSum += peak - preMeal;
      spikeCount++;
    }
  }

  const avgPostMealSpike = spikeCount > 0 ? postMealSpikeSum / spikeCount : 0;

  // Pattern detection (simplified counts)
  let overnightLows = 0;
  let morningHighs = 0;
  let postMealSpikes = 0;

  for (const reading of cgmReadings) {
    const hour = new Date(reading.timestamp).getHours();

    if (hour >= 0 && hour < 6 && reading.glucoseMgDl < TARGET.LOW) {
      overnightLows++;
    }
    if (hour >= 5 && hour < 9 && reading.glucoseMgDl > TARGET.HIGH) {
      morningHighs++;
    }
  }

  postMealSpikes = mealBoluses.filter((bolus) => {
    const oneHourAfter = bolus.timestamp + 60 * 60 * 1000;
    const twoHoursAfter = bolus.timestamp + 120 * 60 * 1000;
    const postMealReadings = cgmReadings.filter(
      (r) => r.timestamp >= oneHourAfter && r.timestamp <= twoHoursAfter
    );
    if (postMealReadings.length === 0) return false;
    const peak = Math.max(...postMealReadings.map((r) => r.glucoseMgDl));
    return peak > TARGET.HIGH;
  }).length;

  return {
    date,
    glucose: {
      min: glucoseStats.min,
      max: glucoseStats.max,
      mean: glucoseStats.mean,
      stdDev: glucoseStats.stdDev,
      cv: glucoseStats.cv,
      tir: glucoseStats.tir,
      readings: glucoseStats.readingCount,
    },
    insulin: {
      totalBolus: Math.round(totalBolus * 10) / 10,
      totalBasal: Math.round(totalBasal * 10) / 10,
      bolusCount,
    },
    meals: {
      count: mealCount,
      avgCarbsPerMeal: Math.round(avgCarbsPerMeal),
      avgPostMealSpike: Math.round(avgPostMealSpike),
    },
    patterns: {
      overnightLows,
      morningHighs,
      postMealSpikes,
    },
    computedAt: Date.now(),
  };
}
