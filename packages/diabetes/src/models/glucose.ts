/**
 * Glucose record types - CGM and finger stick readings
 */

import type { BaseRecord } from "./base.js";

/**
 * CGM glucose reading - typically every 5 minutes
 * Source: cgm_data_1.csv
 */
export interface CgmReading extends BaseRecord {
  type: "cgm";
  /** Glucose value in mg/dL */
  glucoseMgDl: number;
}

/**
 * Manual blood glucose reading from finger stick
 * Source: bg_data_1.csv
 */
export interface BgReading extends BaseRecord {
  type: "bg";
  /** Glucose value in mg/dL */
  glucoseMgDl: number;
  /** Whether this was a manual reading */
  isManual: boolean;
}

/**
 * Union of all glucose reading types
 */
export type GlucoseReading = CgmReading | BgReading;
