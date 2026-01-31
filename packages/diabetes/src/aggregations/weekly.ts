/**
 * Weekly aggregation computation
 */

import type { DailyAggregation, WeeklyAggregation } from "../storage/index.js";

/**
 * Get ISO week string (YYYY-Wxx) from a date
 */
export function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Compute a weekly aggregation from daily aggregations
 */
export function computeWeeklyAggregation(
  week: string,
  dailyAggregations: DailyAggregation[],
  previousWeekAggregation?: WeeklyAggregation
): WeeklyAggregation {
  if (dailyAggregations.length === 0) {
    return {
      week,
      avgTir: 0,
      tirTrend: 0,
      avgDailyInsulin: 0,
      insulinTrend: 0,
      bestDay: "",
      worstDay: "",
      dominantPattern: "none",
      computedAt: Date.now(),
    };
  }

  // Calculate averages
  const avgTir =
    dailyAggregations.reduce((sum, d) => sum + d.glucose.tir, 0) / dailyAggregations.length;

  const avgDailyInsulin =
    dailyAggregations.reduce(
      (sum, d) => sum + d.insulin.totalBolus + d.insulin.totalBasal,
      0
    ) / dailyAggregations.length;

  // Calculate trends vs previous week
  const tirTrend = previousWeekAggregation ? avgTir - previousWeekAggregation.avgTir : 0;
  const insulinTrend = previousWeekAggregation
    ? avgDailyInsulin - previousWeekAggregation.avgDailyInsulin
    : 0;

  // Find best and worst days
  const sortedByTir = [...dailyAggregations].sort((a, b) => b.glucose.tir - a.glucose.tir);
  const bestDay = sortedByTir[0]?.date || "";
  const worstDay = sortedByTir[sortedByTir.length - 1]?.date || "";

  // Determine dominant pattern
  const patternCounts = {
    overnight_lows: 0,
    morning_highs: 0,
    post_meal_spikes: 0,
  };

  for (const daily of dailyAggregations) {
    if (daily.patterns.overnightLows > 0) patternCounts.overnight_lows++;
    if (daily.patterns.morningHighs > 0) patternCounts.morning_highs++;
    if (daily.patterns.postMealSpikes > 0) patternCounts.post_meal_spikes++;
  }

  let dominantPattern = "none";
  let maxCount = 0;
  for (const [pattern, count] of Object.entries(patternCounts)) {
    if (count > maxCount && count >= 3) {
      // At least 3 occurrences to be "dominant"
      dominantPattern = pattern;
      maxCount = count;
    }
  }

  return {
    week,
    avgTir: Math.round(avgTir * 10) / 10,
    tirTrend: Math.round(tirTrend * 10) / 10,
    avgDailyInsulin: Math.round(avgDailyInsulin * 10) / 10,
    insulinTrend: Math.round(insulinTrend * 10) / 10,
    bestDay,
    worstDay,
    dominantPattern,
    computedAt: Date.now(),
  };
}
