/**
 * Debug script to render current frame as ASCII
 */

import {
  generateCompositeFrame,
  frameToAsciiDetailed,
  type BloodSugarDisplayData,
} from "@signage/functions/rendering";
import type { TreatmentDisplayData, GlookoTreatment } from "@signage/functions/glooko/types";

// Sample blood sugar data - testing double digit delta
const sampleBloodSugar: BloodSugarDisplayData = {
  glucose: 142,
  trend: "Flat",
  delta: 4,
  timestamp: Date.now(), // Just now
  rangeStatus: "normal",
  isStale: false,
};

// Sample history (24 hours of data, ~288 readings at 5 min intervals)
const now = Date.now();
const sampleHistory = Array.from({ length: 288 }, (_, i) => ({
  timestamp: now - (288 - i) * 5 * 60 * 1000,
  glucose: 120 + Math.sin(i / 20) * 40 + Math.random() * 10,
}));

// Sample treatment data spanning 3 days for comparison feature
const HOUR = 60 * 60 * 1000;
const sampleTreatments: GlookoTreatment[] = [
  // Period 3: 24h-3h ago (current period, shown as bars on left + number on right)
  // Total insulin: 8 + 5 + 10 + 7 = 30u
  { timestamp: now - 5 * HOUR, type: "insulin", value: 8 },
  { timestamp: now - 5 * HOUR, type: "carbs", value: 60 },
  { timestamp: now - 8 * HOUR, type: "insulin", value: 5 },
  { timestamp: now - 12 * HOUR, type: "insulin", value: 10 },
  { timestamp: now - 12 * HOUR, type: "carbs", value: 80 },
  { timestamp: now - 18 * HOUR, type: "insulin", value: 7 },
  { timestamp: now - 18 * HOUR, type: "carbs", value: 45 },

  // Period 2: 48h-27h ago (yesterday same window)
  // Total insulin: 6 + 8 + 4 + 7 = 25u
  { timestamp: now - 30 * HOUR, type: "insulin", value: 6 },
  { timestamp: now - 30 * HOUR, type: "carbs", value: 55 },
  { timestamp: now - 33 * HOUR, type: "insulin", value: 8 },
  { timestamp: now - 36 * HOUR, type: "insulin", value: 4 },
  { timestamp: now - 36 * HOUR, type: "carbs", value: 70 },
  { timestamp: now - 42 * HOUR, type: "insulin", value: 7 },
  { timestamp: now - 42 * HOUR, type: "carbs", value: 50 },

  // Period 1: 72h-51h ago (2 days ago same window)
  // Total insulin: 5 + 9 + 6 = 20u
  { timestamp: now - 54 * HOUR, type: "insulin", value: 5 },
  { timestamp: now - 54 * HOUR, type: "carbs", value: 40 },
  { timestamp: now - 60 * HOUR, type: "insulin", value: 9 },
  { timestamp: now - 60 * HOUR, type: "carbs", value: 65 },
  { timestamp: now - 66 * HOUR, type: "insulin", value: 6 },
  { timestamp: now - 66 * HOUR, type: "carbs", value: 55 },
];

const sampleTreatmentData: TreatmentDisplayData = {
  treatments: sampleTreatments,
  recentInsulinUnits: 30, // Period 3 total
  recentCarbsGrams: 185,
  lastFetchedAt: now,
  isStale: false,
};

// Generate frame
const frame = generateCompositeFrame({
  bloodSugar: sampleBloodSugar,
  bloodSugarHistory: { points: sampleHistory },
  timezone: "America/Los_Angeles",
  treatments: sampleTreatmentData,
});

// Output ASCII
console.log(frameToAsciiDetailed(frame));
