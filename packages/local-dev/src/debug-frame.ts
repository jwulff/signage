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

// Sample treatment data
const sampleTreatments: GlookoTreatment[] = [
  // Recent treatments (will show in 3h chart on right)
  { timestamp: now - 30 * 60 * 1000, type: "insulin", value: 4 },
  { timestamp: now - 45 * 60 * 1000, type: "carbs", value: 35 },
  { timestamp: now - 2 * 60 * 60 * 1000, type: "insulin", value: 6 },
  { timestamp: now - 2.5 * 60 * 60 * 1000, type: "carbs", value: 50 },
  // Older treatments (will show in 21h chart on left)
  { timestamp: now - 5 * 60 * 60 * 1000, type: "insulin", value: 8 },
  { timestamp: now - 5 * 60 * 60 * 1000, type: "carbs", value: 60 },
  { timestamp: now - 8 * 60 * 60 * 1000, type: "insulin", value: 5 },
  { timestamp: now - 12 * 60 * 60 * 1000, type: "insulin", value: 10 },
  { timestamp: now - 12 * 60 * 60 * 1000, type: "carbs", value: 80 },
  { timestamp: now - 18 * 60 * 60 * 1000, type: "insulin", value: 7 },
  { timestamp: now - 18 * 60 * 60 * 1000, type: "carbs", value: 45 },
];

const sampleTreatmentData: TreatmentDisplayData = {
  treatments: sampleTreatments,
  recentInsulinUnits: 10, // 4 + 6 in last 4h
  recentCarbsGrams: 85, // 35 + 50 in last 4h
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
