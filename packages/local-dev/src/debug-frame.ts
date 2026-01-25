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

// Sample treatment data spanning 36 hours in 6-hour buckets
// Layout: oldest → newest with daylight bars between each bucket
const HOUR = 60 * 60 * 1000;
const sampleTreatments: GlookoTreatment[] = [
  // Bucket 5: 6h-0h ago (most recent) - Total: 12u
  { timestamp: now - 1 * HOUR, type: "insulin", value: 4 },
  { timestamp: now - 3 * HOUR, type: "insulin", value: 5 },
  { timestamp: now - 5 * HOUR, type: "insulin", value: 3 },

  // Bucket 4: 12h-6h ago - Total: 8u
  { timestamp: now - 7 * HOUR, type: "insulin", value: 3 },
  { timestamp: now - 10 * HOUR, type: "insulin", value: 5 },

  // Bucket 3: 18h-12h ago - Total: 15u
  { timestamp: now - 13 * HOUR, type: "insulin", value: 6 },
  { timestamp: now - 16 * HOUR, type: "insulin", value: 9 },

  // Bucket 2: 24h-18h ago - Total: 10u
  { timestamp: now - 19 * HOUR, type: "insulin", value: 4 },
  { timestamp: now - 22 * HOUR, type: "insulin", value: 6 },

  // Bucket 1: 30h-24h ago - Total: 7u
  { timestamp: now - 25 * HOUR, type: "insulin", value: 3 },
  { timestamp: now - 28 * HOUR, type: "insulin", value: 4 },

  // Bucket 0: 36h-30h ago (oldest) - Total: 5u
  { timestamp: now - 31 * HOUR, type: "insulin", value: 2 },
  { timestamp: now - 34 * HOUR, type: "insulin", value: 3 },
];

const sampleTreatmentData: TreatmentDisplayData = {
  treatments: sampleTreatments,
  recentInsulinUnits: 12, // Last 6h total
  recentCarbsGrams: 0,
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
