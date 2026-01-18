/**
 * Widget History Query API
 * Functions for querying and formatting history data for chart rendering.
 */

import { queryHistory } from "./history-store";
import type { TimeSeriesPoint } from "./types";

/**
 * Blood sugar value structure stored in history.
 */
export interface BloodSugarHistoryValue {
  glucose: number;
  glucoseMmol: number;
  rangeStatus: "urgentLow" | "low" | "normal" | "high" | "veryHigh";
}

/**
 * Blood sugar history point with value and metadata.
 */
export interface BloodSugarHistoryPoint
  extends TimeSeriesPoint<BloodSugarHistoryValue> {
  meta?: {
    trend?: string;
    trendArrow?: string;
    delta?: number;
  };
}

/**
 * Statistics calculated from blood sugar history.
 */
export interface BloodSugarStats {
  /** Average glucose in mg/dL */
  average: number;
  /** Minimum glucose in mg/dL */
  min: number;
  /** Maximum glucose in mg/dL */
  max: number;
  /** Standard deviation */
  stdDev: number;
  /** Time in range (70-180 mg/dL) as percentage */
  timeInRange: number;
  /** Number of data points */
  count: number;
  /** Earliest timestamp in the data */
  startTime: number;
  /** Latest timestamp in the data */
  endTime: number;
}

/**
 * Response from getBloodSugarHistory.
 */
export interface BloodSugarHistoryResponse {
  points: BloodSugarHistoryPoint[];
  stats: BloodSugarStats;
}

/** Default history query window in hours */
const DEFAULT_HOURS = 24;

/** Normal range boundaries for time-in-range calculation */
const NORMAL_RANGE = { low: 70, high: 180 };

/**
 * Get blood sugar history for charting.
 * @param hours Number of hours of history to fetch (default: 24)
 * @returns History points with calculated statistics
 */
export async function getBloodSugarHistory(
  hours: number = DEFAULT_HOURS
): Promise<BloodSugarHistoryResponse> {
  const now = Date.now();
  const since = now - hours * 60 * 60 * 1000;

  const points = await queryHistory<BloodSugarHistoryValue>(
    "bloodsugar",
    since,
    now
  );

  if (points.length === 0) {
    return {
      points: [],
      stats: {
        average: 0,
        min: 0,
        max: 0,
        stdDev: 0,
        timeInRange: 0,
        count: 0,
        startTime: since,
        endTime: now,
      },
    };
  }

  const stats = calculateStats(points);

  return {
    points: points as BloodSugarHistoryPoint[],
    stats,
  };
}

/**
 * Calculate statistics from blood sugar history points.
 */
function calculateStats(
  points: TimeSeriesPoint<BloodSugarHistoryValue>[]
): BloodSugarStats {
  const values = points.map((p) => p.value.glucose);
  const count = values.length;

  if (count === 0) {
    return {
      average: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      timeInRange: 0,
      count: 0,
      startTime: 0,
      endTime: 0,
    };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const average = sum / count;
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Standard deviation
  const squaredDiffs = values.map((v) => Math.pow(v - average, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / count;
  const stdDev = Math.sqrt(avgSquaredDiff);

  // Time in range (percentage of readings in 70-180 mg/dL)
  const inRangeCount = values.filter(
    (v) => v >= NORMAL_RANGE.low && v <= NORMAL_RANGE.high
  ).length;
  const timeInRange = (inRangeCount / count) * 100;

  return {
    average: Math.round(average),
    min,
    max,
    stdDev: Math.round(stdDev * 10) / 10,
    timeInRange: Math.round(timeInRange * 10) / 10,
    count,
    startTime: points[0].timestamp,
    endTime: points[count - 1].timestamp,
  };
}

/**
 * Get aggregated blood sugar data binned by interval.
 * Useful for lower-resolution charts or trend analysis.
 * @param hours Number of hours of history
 * @param intervalMinutes Bin size in minutes (default: 15)
 */
export async function getBloodSugarHistoryBinned(
  hours: number = DEFAULT_HOURS,
  intervalMinutes: number = 15
): Promise<{
  bins: Array<{
    timestamp: number;
    average: number;
    min: number;
    max: number;
    count: number;
  }>;
  stats: BloodSugarStats;
}> {
  const { points, stats } = await getBloodSugarHistory(hours);

  if (points.length === 0) {
    return { bins: [], stats };
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  const bins = new Map<
    number,
    { values: number[]; timestamp: number }
  >();

  for (const point of points) {
    // Round timestamp down to interval boundary
    const binTime =
      Math.floor(point.timestamp / intervalMs) * intervalMs;

    if (!bins.has(binTime)) {
      bins.set(binTime, { values: [], timestamp: binTime });
    }
    bins.get(binTime)!.values.push(point.value.glucose);
  }

  // Convert bins to output format
  const binnedData = Array.from(bins.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((bin) => ({
      timestamp: bin.timestamp,
      average: Math.round(
        bin.values.reduce((a, b) => a + b, 0) / bin.values.length
      ),
      min: Math.min(...bin.values),
      max: Math.max(...bin.values),
      count: bin.values.length,
    }));

  return { bins: binnedData, stats };
}
