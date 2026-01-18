/**
 * Debug script to render current frame as ASCII
 */

import {
  generateCompositeFrame,
  frameToAsciiDetailed,
  type BloodSugarDisplayData,
} from "@signage/functions/rendering";

// Sample blood sugar data - testing double digit delta
const sampleBloodSugar: BloodSugarDisplayData = {
  glucose: 213,
  trend: "FortyFiveUp",
  delta: 13,
  timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
  rangeStatus: "high",
  isStale: false,
};

// Sample history (3 hours of data)
const now = Date.now();
const sampleHistory = Array.from({ length: 36 }, (_, i) => ({
  timestamp: now - (36 - i) * 5 * 60 * 1000,
  glucose: 150 + Math.sin(i / 5) * 30 + Math.random() * 10,
}));

// Generate frame
const frame = generateCompositeFrame({
  bloodSugar: sampleBloodSugar,
  bloodSugarHistory: { points: sampleHistory },
  timezone: "America/Los_Angeles",
});

// Output ASCII
console.log(frameToAsciiDetailed(frame));
