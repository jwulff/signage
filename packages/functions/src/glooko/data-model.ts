/**
 * Glooko Data Model
 *
 * Comprehensive type definitions for all diabetes data from Glooko exports.
 * Designed for idempotent storage in DynamoDB with full historical retention.
 */

// =============================================================================
// Base Types
// =============================================================================

/**
 * All Glooko records share these common fields
 */
export interface GlookoBaseRecord {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Device serial number (e.g., insulin pump ID) */
  deviceSerial?: string;
  /** Source file this record came from */
  sourceFile?: string;
  /** When this record was imported */
  importedAt: number;
}

// =============================================================================
// CGM (Continuous Glucose Monitor) Data
// =============================================================================

/**
 * CGM glucose reading - typically every 5 minutes
 * Source: cgm_data_1.csv
 */
export interface CgmReading extends GlookoBaseRecord {
  type: "cgm";
  /** Glucose value in mg/dL */
  glucoseMgDl: number;
}

// =============================================================================
// Blood Glucose (Finger Stick) Data
// =============================================================================

/**
 * Manual blood glucose reading from finger stick
 * Source: bg_data_1.csv
 */
export interface BgReading extends GlookoBaseRecord {
  type: "bg";
  /** Glucose value in mg/dL */
  glucoseMgDl: number;
  /** Whether this was a manual reading */
  isManual: boolean;
}

// =============================================================================
// Bolus (Insulin Dose) Data
// =============================================================================

/**
 * Bolus delivery types
 */
export type BolusType = "Normal" | "Extended" | "Combo" | "Other";

/**
 * Individual bolus (insulin dose) record
 * Source: bolus_data_1.csv
 *
 * This is the richest record type - contains insulin, carbs, BG, and settings
 */
export interface BolusRecord extends GlookoBaseRecord {
  type: "bolus";
  /** Type of bolus delivery */
  bolusType: BolusType;
  /** Blood glucose at time of bolus (mg/dL), 0 if not entered */
  bgInputMgDl: number;
  /** Carbs entered for calculation (grams), 0 if not entered */
  carbsInputGrams: number;
  /** Insulin-to-carb ratio setting (g carbs per 1U insulin) */
  carbRatio: number;
  /** Total insulin delivered (units) */
  insulinDeliveredUnits: number;
  /** Immediate portion of delivery (units), for combo boluses */
  initialDeliveryUnits?: number;
  /** Extended portion of delivery (units), for combo/extended boluses */
  extendedDeliveryUnits?: number;
}

// =============================================================================
// Basal (Background Insulin) Data
// =============================================================================

/**
 * Basal rate record - background insulin delivery
 * Source: basal_data_1.csv
 */
export interface BasalRecord extends GlookoBaseRecord {
  type: "basal";
  /** Type of basal (scheduled, temp, suspend, etc.) */
  basalType: string;
  /** Duration in minutes */
  durationMinutes: number;
  /** Percentage of normal rate (for temp basals) */
  percentage?: number;
  /** Basal rate (units/hour) */
  rate?: number;
  /** Total insulin delivered during this period (units) */
  insulinDeliveredUnits?: number;
}

// =============================================================================
// Daily Insulin Summary
// =============================================================================

/**
 * Daily insulin totals - one record per day
 * Source: insulin_data_1.csv
 */
export interface DailyInsulinSummary extends GlookoBaseRecord {
  type: "daily_insulin";
  /** Date string YYYY-MM-DD */
  date: string;
  /** Total bolus insulin for the day (units) */
  totalBolusUnits: number;
  /** Total basal insulin for the day (units) */
  totalBasalUnits: number;
  /** Total insulin for the day (units) */
  totalInsulinUnits: number;
}

// =============================================================================
// Alarm/Event Data
// =============================================================================

/**
 * Device alarm or event
 * Source: alarms_data_1.csv
 */
export interface AlarmRecord extends GlookoBaseRecord {
  type: "alarm";
  /** Alarm/event description */
  event: string;
}

// =============================================================================
// Carbs (Standalone) Data
// =============================================================================

/**
 * Standalone carb entry (not associated with a bolus)
 * Source: carbs_data_1.csv
 */
export interface CarbsRecord extends GlookoBaseRecord {
  type: "carbs";
  /** Carbohydrates in grams */
  carbsGrams: number;
}

// =============================================================================
// Food Log Data
// =============================================================================

/**
 * Detailed food log entry
 * Source: food_data_1.csv
 */
export interface FoodRecord extends GlookoBaseRecord {
  type: "food";
  /** Food name/description */
  name: string;
  /** Carbohydrates in grams */
  carbsGrams?: number;
  /** Fat in grams */
  fatGrams?: number;
  /** Protein in grams */
  proteinGrams?: number;
  /** Calories */
  calories?: number;
  /** Serving size quantity */
  servingQuantity?: number;
  /** Number of servings */
  numberOfServings?: number;
}

// =============================================================================
// Exercise Data
// =============================================================================

/**
 * Exercise intensity levels
 */
export type ExerciseIntensity = "Low" | "Medium" | "High" | "Other";

/**
 * Exercise/activity log entry
 * Source: exercise_data_1.csv
 */
export interface ExerciseRecord extends GlookoBaseRecord {
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

// =============================================================================
// Medication Data
// =============================================================================

/**
 * Non-insulin medication record
 * Source: medication_data_1.csv
 */
export interface MedicationRecord extends GlookoBaseRecord {
  type: "medication";
  /** Medication name */
  name: string;
  /** Dose value */
  value?: number;
  /** Medication type/category */
  medicationType?: string;
}

// =============================================================================
// Manual Insulin Data
// =============================================================================

/**
 * Manual insulin injection (not from pump)
 * Source: manual_insulin_data_1.csv
 */
export interface ManualInsulinRecord extends GlookoBaseRecord {
  type: "manual_insulin";
  /** Insulin name/brand */
  name?: string;
  /** Units injected */
  units: number;
  /** Insulin type (rapid, long-acting, etc.) */
  insulinType?: string;
}

// =============================================================================
// Notes Data
// =============================================================================

/**
 * Free-form note entry
 * Source: notes_data_1.csv
 */
export interface NoteRecord extends GlookoBaseRecord {
  type: "note";
  /** Note text content */
  text: string;
}

// =============================================================================
// Union Types
// =============================================================================

/**
 * All possible Glooko record types
 */
export type GlookoRecord =
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
export type GlookoRecordType = GlookoRecord["type"];

// =============================================================================
// DynamoDB Key Types
// =============================================================================

/**
 * DynamoDB key structure for Glooko records
 *
 * Key Design:
 * - PK: USER#{userId}#{recordType} - Partition by user and data type
 * - SK: {timestamp}#{uniqueHash} - Sort by time, hash for deduplication
 *
 * This enables:
 * - Efficient time-range queries within a data type
 * - Idempotent writes (same record = same key = no duplicates)
 * - Scalable partitioning by user and data type
 */
export interface GlookoRecordKey {
  pk: string; // USER#{userId}#{type}
  sk: string; // {timestamp}#{uniqueHash}
}

/**
 * Full DynamoDB item (key + data)
 */
export interface GlookoRecordItem extends GlookoRecordKey {
  /** The actual record data */
  data: GlookoRecord;
  /** TTL for automatic expiration (optional, in seconds since epoch) */
  ttl?: number;
  /** GSI1 partition key for cross-type queries */
  gsi1pk?: string; // USER#{userId}
  /** GSI1 sort key for cross-type time queries */
  gsi1sk?: string; // {type}#{timestamp}
}

// =============================================================================
// Import Metadata
// =============================================================================

/**
 * Metadata about an import job
 */
export interface ImportMetadata {
  /** Unique import job ID */
  importId: string;
  /** When the import started */
  startedAt: number;
  /** When the import completed */
  completedAt?: number;
  /** Date range of exported data */
  dataStartDate: string;
  dataEndDate: string;
  /** Record counts by type */
  recordCounts: Partial<Record<GlookoRecordType, number>>;
  /** Total records imported */
  totalRecords: number;
  /** Any errors encountered */
  errors?: string[];
}

// =============================================================================
// Aggregation Types (for display)
// =============================================================================

/**
 * Treatment summary for display (last N hours)
 */
export interface TreatmentSummary {
  /** Time window start */
  windowStartMs: number;
  /** Time window end */
  windowEndMs: number;
  /** Total insulin in window (units) */
  totalInsulinUnits: number;
  /** Total carbs in window (grams) */
  totalCarbsGrams: number;
  /** Number of boluses */
  bolusCount: number;
  /** Individual treatments for chart overlay */
  treatments: Array<{
    timestamp: number;
    type: "insulin" | "carbs";
    value: number;
  }>;
}
