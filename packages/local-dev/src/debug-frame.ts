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

// Sample treatment data spanning 4 days (midnight to midnight)
// Each day shows total insulin for that calendar day
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Calculate midnight today in local time
const todayMidnight = new Date(now);
todayMidnight.setHours(0, 0, 0, 0);
const midnight = todayMidnight.getTime();

const sampleTreatments: GlookoTreatment[] = [
  // Day 3: Today (partial day, up to now) - Total: 18u
  { timestamp: midnight + 2 * HOUR, type: "insulin", value: 6 },   // 2am
  { timestamp: midnight + 8 * HOUR, type: "insulin", value: 7 },   // 8am
  { timestamp: midnight + 12 * HOUR, type: "insulin", value: 5 },  // noon

  // Day 2: Yesterday - Total: 42u
  { timestamp: midnight - 22 * HOUR, type: "insulin", value: 8 },  // 2am yesterday
  { timestamp: midnight - 16 * HOUR, type: "insulin", value: 10 }, // 8am yesterday
  { timestamp: midnight - 12 * HOUR, type: "insulin", value: 12 }, // noon yesterday
  { timestamp: midnight - 6 * HOUR, type: "insulin", value: 12 },  // 6pm yesterday

  // Day 1: 2 days ago - Total: 35u
  { timestamp: midnight - DAY - 22 * HOUR, type: "insulin", value: 7 },
  { timestamp: midnight - DAY - 16 * HOUR, type: "insulin", value: 9 },
  { timestamp: midnight - DAY - 12 * HOUR, type: "insulin", value: 10 },
  { timestamp: midnight - DAY - 6 * HOUR, type: "insulin", value: 9 },

  // Day 0: 3 days ago (oldest) - Total: 28u
  { timestamp: midnight - 2 * DAY - 22 * HOUR, type: "insulin", value: 6 },
  { timestamp: midnight - 2 * DAY - 16 * HOUR, type: "insulin", value: 8 },
  { timestamp: midnight - 2 * DAY - 12 * HOUR, type: "insulin", value: 7 },
  { timestamp: midnight - 2 * DAY - 6 * HOUR, type: "insulin", value: 7 },
];

const sampleTreatmentData: TreatmentDisplayData = {
  treatments: sampleTreatments,
  recentInsulinUnits: 18, // Today's total
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
