/**
 * @diabetes/core - Analysis
 *
 * Computed metrics and pattern detection for diabetes data
 */

// Glucose statistics
export {
  TARGET,
  calculateGlucoseStats,
  calculateTimeInRange,
  classifyGlucose,
  calculateTrend,
  type GlucoseStats,
} from "./glucose-stats.js";

// Pattern detection
export {
  detectOvernightLowPattern,
  detectPostMealSpikePattern,
  detectMorningHighPattern,
  detectAllPatterns,
  type DetectedPattern,
} from "./patterns.js";
