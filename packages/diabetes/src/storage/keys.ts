/**
 * DynamoDB key generation for diabetes records
 *
 * Key Design (v2 - Date Partitioned):
 * - PK: USR#{userId}#{recordType}#{YYYY-MM-DD} - Partition by user, type, and date
 * - SK: {timestamp}#{uniqueHash} - Sort by time within day, hash for deduplication
 *
 * This design:
 * - Prevents hot partitions (max ~300 items per partition per day)
 * - Enables efficient date-range queries
 * - Supports indefinite retention with predictable access patterns
 * - Allows idempotent writes via conditional puts
 */

import { createHash } from "crypto";
import type { DiabetesRecord } from "../models/index.js";

/**
 * The timezone for date calculations (matches Glooko export timezone)
 */
export const DATA_TIMEZONE = "America/Los_Angeles";

/**
 * Format a timestamp as YYYY-MM-DD in the data timezone
 */
export function formatDateInTimezone(timestampMs: number, timezone: string = DATA_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(timestampMs));
}

/**
 * Generate a unique hash for deduplication
 * Uses key fields that make a record unique
 */
export function generateRecordHash(record: DiabetesRecord): string {
  let hashInput: string;

  switch (record.type) {
    case "cgm":
      hashInput = `${record.timestamp}:${record.glucoseMgDl}`;
      break;
    case "bg":
      hashInput = `${record.timestamp}:${record.glucoseMgDl}`;
      break;
    case "bolus":
      hashInput = `${record.timestamp}:${record.insulinDeliveredUnits}:${record.carbsInputGrams}`;
      break;
    case "basal":
      hashInput = `${record.timestamp}:${record.rate}:${record.durationMinutes}`;
      break;
    case "daily_insulin":
      hashInput = record.date;
      break;
    case "alarm":
      hashInput = `${record.timestamp}:${record.event}`;
      break;
    case "carbs":
      hashInput = `${record.timestamp}:${record.carbsGrams}`;
      break;
    case "food":
      hashInput = `${record.timestamp}:${record.name}:${record.carbsGrams}`;
      break;
    case "exercise":
      hashInput = `${record.timestamp}:${record.name}`;
      break;
    case "medication":
      hashInput = `${record.timestamp}:${record.name}:${record.value}`;
      break;
    case "manual_insulin":
      hashInput = `${record.timestamp}:${record.units}`;
      break;
    case "note":
      hashInput = `${record.timestamp}:${record.text}`;
      break;
    default:
      hashInput = JSON.stringify(record);
  }

  return createHash("sha256").update(hashInput).digest("hex").substring(0, 12);
}

/**
 * DynamoDB key structure for diabetes records
 */
export interface RecordKeys {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  gsi2pk?: string;
  gsi2sk?: string;
}

/**
 * Generate DynamoDB keys for a record (v2 schema - date partitioned)
 *
 * Primary Table:
 * - PK: USR#{userId}#{TYPE}#{YYYY-MM-DD}
 * - SK: {timestamp} or {timestamp}#{hash}
 *
 * GSI1 (cross-type time queries):
 * - PK: USR#{userId}#ALL
 * - SK: {timestamp}
 *
 * GSI2 (type-based date range):
 * - PK: USR#{userId}#{TYPE}
 * - SK: {YYYY-MM-DD}#{timestamp}
 */
export function generateRecordKeys(userId: string, record: DiabetesRecord): RecordKeys {
  const timestamp = record.timestamp.toString().padStart(15, "0");
  const date = formatDateInTimezone(record.timestamp);
  const typeUpper = record.type.toUpperCase();

  // Special handling for daily_insulin - date is the sort key for dedup
  if (record.type === "daily_insulin") {
    return {
      pk: `USR#${userId}#DAILY_INSULIN#${record.date}`,
      sk: "_", // Singleton per date
      gsi1pk: `USR#${userId}#ALL`,
      gsi1sk: `${timestamp}`,
      gsi2pk: `USR#${userId}#DAILY_INSULIN`,
      gsi2sk: record.date,
    };
  }

  // All other record types use timestamp + hash
  const hash = generateRecordHash(record);

  return {
    pk: `USR#${userId}#${typeUpper}#${date}`,
    sk: `${timestamp}#${hash}`,
    gsi1pk: `USR#${userId}#ALL`,
    gsi1sk: timestamp,
    gsi2pk: `USR#${userId}#${typeUpper}`,
    gsi2sk: `${date}#${timestamp}`,
  };
}

/**
 * Generate keys for aggregation records
 */
export function generateAggregationKeys(
  userId: string,
  aggregationType: "DAILY" | "WEEKLY",
  period: string // YYYY-MM-DD for daily, YYYY-Wxx for weekly
): RecordKeys {
  return {
    pk: `USR#${userId}#AGG#${aggregationType}`,
    sk: period,
    gsi1pk: `USR#${userId}#AGG`,
    gsi1sk: `${aggregationType}#${period}`,
  };
}

/**
 * Generate keys for insight records
 */
export function generateInsightKeys(
  userId: string,
  insightType: "CURRENT" | "HISTORY",
  timestamp?: number
): RecordKeys {
  if (insightType === "CURRENT") {
    return {
      pk: `USR#${userId}#INSIGHT#CURRENT`,
      sk: "_",
      gsi1pk: `USR#${userId}#INSIGHT`,
      gsi1sk: "CURRENT",
    };
  }

  const ts = (timestamp ?? Date.now()).toString().padStart(15, "0");
  return {
    pk: `USR#${userId}#INSIGHT#HISTORY`,
    sk: ts,
    gsi1pk: `USR#${userId}#INSIGHT`,
    gsi1sk: `HISTORY#${ts}`,
  };
}
