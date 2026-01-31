/**
 * Insulin record types - bolus, basal, and manual injections
 */

import type { BaseRecord } from "./base.js";

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
export interface BolusRecord extends BaseRecord {
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

/**
 * Basal rate record - background insulin delivery
 * Source: basal_data_1.csv
 */
export interface BasalRecord extends BaseRecord {
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

/**
 * Daily insulin totals - one record per day
 * Source: insulin_data_1.csv
 */
export interface DailyInsulinSummary extends BaseRecord {
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

/**
 * Manual insulin injection (not from pump)
 * Source: manual_insulin_data_1.csv
 */
export interface ManualInsulinRecord extends BaseRecord {
  type: "manual_insulin";
  /** Insulin name/brand */
  name?: string;
  /** Units injected */
  units: number;
  /** Insulin type (rapid, long-acting, etc.) */
  insulinType?: string;
}

/**
 * Union of all insulin record types
 */
export type InsulinRecord = BolusRecord | BasalRecord | DailyInsulinSummary | ManualInsulinRecord;
