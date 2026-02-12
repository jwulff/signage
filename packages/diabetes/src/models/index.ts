/**
 * @diabetes/core - Models
 *
 * Type definitions for all diabetes data records
 */

// Base types
export type { BaseRecord } from "./base.js";

// Glucose types
export type { CgmReading, BgReading, GlucoseReading } from "./glucose.js";

// Insulin types
export type {
  BolusType,
  BolusRecord,
  BasalRecord,
  DailyInsulinSummary,
  ManualInsulinRecord,
  InsulinRecord,
} from "./insulin.js";

// Nutrition types
export type { CarbsRecord, FoodRecord, NutritionRecord } from "./nutrition.js";

// Activity types
export type {
  ExerciseIntensity,
  ExerciseRecord,
  MedicationRecord,
  AlarmRecord,
  NoteRecord,
  ActivityRecord,
} from "./activity.js";

// Union types
export type { DiabetesRecord, DiabetesRecordType } from "./records.js";
export { RECORD_TYPES } from "./records.js";

// Insight types
export type {
  InsightType,
  InsightZone,
  Insight,
  InsightMetrics,
  StoredInsight,
} from "./insights.js";
