/**
 * Union types and helpers for all diabetes records
 */

import type { CgmReading, BgReading, GlucoseReading } from "./glucose.js";
import type {
  BolusRecord,
  BasalRecord,
  DailyInsulinSummary,
  ManualInsulinRecord,
  InsulinRecord,
} from "./insulin.js";
import type { CarbsRecord, FoodRecord, NutritionRecord } from "./nutrition.js";
import type {
  ExerciseRecord,
  MedicationRecord,
  AlarmRecord,
  NoteRecord,
  ActivityRecord,
} from "./activity.js";

/**
 * All possible diabetes record types
 */
export type DiabetesRecord =
  | CgmReading
  | BgReading
  | BolusRecord
  | BasalRecord
  | DailyInsulinSummary
  | AlarmRecord
  | CarbsRecord
  | FoodRecord
  | ExerciseRecord
  | MedicationRecord
  | ManualInsulinRecord
  | NoteRecord;

/**
 * Record type discriminator
 */
export type DiabetesRecordType = DiabetesRecord["type"];

/**
 * All record types as a const array for iteration
 */
export const RECORD_TYPES = [
  "cgm",
  "bg",
  "bolus",
  "basal",
  "daily_insulin",
  "alarm",
  "carbs",
  "food",
  "exercise",
  "medication",
  "manual_insulin",
  "note",
] as const;

// Re-export grouped types for convenience
export type { GlucoseReading, InsulinRecord, NutritionRecord, ActivityRecord };
