/**
 * Activity and health record types
 */

import type { BaseRecord } from "./base.js";

/**
 * Exercise intensity levels
 */
export type ExerciseIntensity = "Low" | "Medium" | "High" | "Other";

/**
 * Exercise/activity log entry
 * Source: exercise_data_1.csv
 */
export interface ExerciseRecord extends BaseRecord {
  type: "exercise";
  /** Exercise name/type */
  name: string;
  /** Intensity level */
  intensity?: ExerciseIntensity;
  /** Duration in minutes */
  durationMinutes?: number;
  /** Estimated calories burned */
  caloriesBurned?: number;
}

/**
 * Non-insulin medication record
 * Source: medication_data_1.csv
 */
export interface MedicationRecord extends BaseRecord {
  type: "medication";
  /** Medication name */
  name: string;
  /** Dose value */
  value?: number;
  /** Medication type/category */
  medicationType?: string;
}

/**
 * Device alarm or event
 * Source: alarms_data_1.csv
 */
export interface AlarmRecord extends BaseRecord {
  type: "alarm";
  /** Alarm/event description */
  event: string;
}

/**
 * Free-form note entry
 * Source: notes_data_1.csv
 */
export interface NoteRecord extends BaseRecord {
  type: "note";
  /** Note text content */
  text: string;
}

/**
 * Union of all activity/health record types
 */
export type ActivityRecord = ExerciseRecord | MedicationRecord | AlarmRecord | NoteRecord;
