/**
 * Glooko Data Storage
 *
 * DynamoDB storage layer for Glooko diabetes data.
 * Implements idempotent writes using composite keys for deduplication.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash } from "crypto";
import type {
  GlookoRecord,
  GlookoRecordItem,
  GlookoRecordType,
  ImportMetadata,
  TreatmentSummary,
  BolusRecord,
  CarbsRecord,
  ManualInsulinRecord,
} from "./data-model.js";

// =============================================================================
// Configuration
// =============================================================================

const MAX_BATCH_SIZE = 25; // DynamoDB BatchWrite limit

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate a unique hash for deduplication
 * Uses key fields that make a record unique
 */
function generateRecordHash(record: GlookoRecord): string {
  let hashInput: string;

  switch (record.type) {
    case "cgm":
      // CGM: timestamp + glucose value is unique
      hashInput = `${record.timestamp}:${record.glucoseMgDl}`;
      break;

    case "bg":
      // BG: timestamp + glucose value is unique
      hashInput = `${record.timestamp}:${record.glucoseMgDl}`;
      break;

    case "bolus":
      // Bolus: timestamp + insulin delivered + carbs
      hashInput = `${record.timestamp}:${record.insulinDeliveredUnits}:${record.carbsInputGrams}`;
      break;

    case "basal":
      // Basal: timestamp + rate + duration
      hashInput = `${record.timestamp}:${record.rate}:${record.durationMinutes}`;
      break;

    case "daily_insulin":
      // Daily: date is unique
      hashInput = record.date;
      break;

    case "alarm":
      // Alarm: timestamp + event text
      hashInput = `${record.timestamp}:${record.event}`;
      break;

    case "carbs":
      // Carbs: timestamp + amount
      hashInput = `${record.timestamp}:${record.carbsGrams}`;
      break;

    case "food":
      // Food: timestamp + name + carbs
      hashInput = `${record.timestamp}:${record.name}:${record.carbsGrams}`;
      break;

    case "exercise":
      // Exercise: timestamp + name
      hashInput = `${record.timestamp}:${record.name}`;
      break;

    case "medication":
      // Medication: timestamp + name + value
      hashInput = `${record.timestamp}:${record.name}:${record.value}`;
      break;

    case "manual_insulin":
      // Manual insulin: timestamp + units
      hashInput = `${record.timestamp}:${record.units}`;
      break;

    case "note":
      // Note: timestamp + text hash
      hashInput = `${record.timestamp}:${record.text}`;
      break;

    default:
      // Fallback: use full record JSON
      hashInput = JSON.stringify(record);
  }

  // Create short hash (first 12 chars of SHA256)
  return createHash("sha256").update(hashInput).digest("hex").substring(0, 12);
}

/**
 * Generate DynamoDB keys for a record
 *
 * For daily_insulin records, we use the date string as the sort key.
 * This ensures exactly one record per date, enabling deterministic queries.
 */
export function generateRecordKeys(
  userId: string,
  record: GlookoRecord
): { pk: string; sk: string; gsi1pk: string; gsi1sk: string } {
  const timestamp = record.timestamp.toString().padStart(15, "0");

  // For daily_insulin, use date as sk to ensure one record per date
  if (record.type === "daily_insulin") {
    return {
      pk: `USER#${userId}#DAILY_INSULIN`,
      sk: record.date, // e.g., "2026-01-29"
      gsi1pk: `USER#${userId}`,
      gsi1sk: `DAILY_INSULIN#${record.date}`,
    };
  }

  // For all other record types, use timestamp + hash
  const hash = generateRecordHash(record);
  return {
    pk: `USER#${userId}#${record.type.toUpperCase()}`,
    sk: `${timestamp}#${hash}`,
    gsi1pk: `USER#${userId}`,
    gsi1sk: `${record.type.toUpperCase()}#${timestamp}`,
  };
}

// =============================================================================
// Storage Class
// =============================================================================

export class GlookoStorage {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;
  private userId: string;

  constructor(tableName: string, userId: string) {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
    this.tableName = tableName;
    this.userId = userId;
  }

  /**
   * Store multiple records with idempotent batch writes
   * Returns count of records written (may be less than input if duplicates exist)
   */
  async storeRecords(records: GlookoRecord[]): Promise<{
    written: number;
    duplicates: number;
    errors: string[];
  }> {
    const items: GlookoRecordItem[] = records.map((record) => {
      const keys = generateRecordKeys(this.userId, record);
      return {
        ...keys,
        data: record,
      };
    });

    let written = 0;
    let duplicates = 0;
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < items.length; i += MAX_BATCH_SIZE) {
      const batch = items.slice(i, i + MAX_BATCH_SIZE);

      try {
        const result = await this.batchWriteWithDedup(batch);
        written += result.written;
        duplicates += result.duplicates;
        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Batch ${i / MAX_BATCH_SIZE}: ${errorMsg}`);
      }
    }

    return { written, duplicates, errors };
  }

  /**
   * Batch write with duplicate detection
   * Uses conditional writes to avoid overwriting existing records.
   *
   * Exception: daily_insulin records use upsert behavior - they always
   * overwrite to ensure we have the latest (highest) value for each date.
   */
  private async batchWriteWithDedup(items: GlookoRecordItem[]): Promise<{
    written: number;
    duplicates: number;
    errors: string[];
  }> {
    let written = 0;
    let duplicates = 0;
    const errors: string[] = [];

    // For idempotent writes, we use individual PutItem with conditions
    // BatchWrite doesn't support conditions, so we process individually
    // This is slower but guarantees no duplicates

    const writePromises = items.map(async (item) => {
      try {
        const record = item.data;
        const isDailyInsulin = record.type === "daily_insulin";

        if (isDailyInsulin) {
          // For daily_insulin: upsert - always write, keep highest value
          // Use conditional write to only update if new value is higher
          await this.docClient.send(
            new PutCommand({
              TableName: this.tableName,
              Item: item,
              // Only write if record doesn't exist OR new value is higher
              ConditionExpression:
                "attribute_not_exists(pk) OR #data.#total < :newTotal",
              ExpressionAttributeNames: {
                "#data": "data",
                "#total": "totalInsulinUnits",
              },
              ExpressionAttributeValues: {
                ":newTotal": record.totalInsulinUnits,
              },
            })
          );
          return { status: "written" as const };
        } else {
          // For all other types: strict deduplication
          await this.docClient.send(
            new PutCommand({
              TableName: this.tableName,
              Item: item,
              // Only write if this exact key doesn't exist
              ConditionExpression: "attribute_not_exists(pk)",
            })
          );
          return { status: "written" as const };
        }
      } catch (error: unknown) {
        // Check if it's a conditional check failure (duplicate or lower value)
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "ConditionalCheckFailedException"
        ) {
          return { status: "duplicate" as const };
        }
        // Other error
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { status: "error" as const, error: errorMsg };
      }
    });

    const results = await Promise.all(writePromises);

    for (const result of results) {
      if (result.status === "written") {
        written++;
      } else if (result.status === "duplicate") {
        duplicates++;
      } else if (result.status === "error") {
        errors.push(result.error);
      }
    }

    return { written, duplicates, errors };
  }

  /**
   * Query records by type and time range
   */
  async queryByTypeAndTimeRange(
    recordType: GlookoRecordType,
    startTime: number,
    endTime: number,
    limit?: number
  ): Promise<GlookoRecord[]> {
    const pk = `USER#${this.userId}#${recordType.toUpperCase()}`;
    const skStart = startTime.toString().padStart(15, "0");
    const skEnd = endTime.toString().padStart(15, "0") + "~"; // ~ sorts after any hash

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND sk BETWEEN :start AND :end",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":start": skStart,
          ":end": skEnd,
        },
        Limit: limit,
        ScanIndexForward: false, // Most recent first
      })
    );

    return (result.Items || []).map((item) => item.data as GlookoRecord);
  }

  /**
   * Query daily insulin totals by date range
   *
   * Unlike other record types that use timestamp-based sort keys,
   * daily_insulin uses date strings (YYYY-MM-DD) as sort keys.
   * This enables deterministic queries for specific date ranges.
   *
   * @param startDate - Start date in YYYY-MM-DD format (inclusive)
   * @param endDate - End date in YYYY-MM-DD format (inclusive)
   * @returns Map of date string to total insulin units
   */
  async queryDailyInsulinByDateRange(
    startDate: string,
    endDate: string
  ): Promise<Record<string, number>> {
    const pk = `USER#${this.userId}#DAILY_INSULIN`;

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND sk BETWEEN :start AND :end",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":start": startDate,
          ":end": endDate + "~", // ~ ensures end date is inclusive
        },
      })
    );

    const totals: Record<string, number> = {};
    for (const item of result.Items || []) {
      const data = item.data as { date?: string; totalInsulinUnits?: number };
      if (data?.date && typeof data?.totalInsulinUnits === "number") {
        totals[data.date] = data.totalInsulinUnits;
      }
    }

    return totals;
  }

  /**
   * Get treatment summary for display (insulin + carbs in time window)
   */
  async getTreatmentSummary(windowHours: number = 4): Promise<TreatmentSummary> {
    const now = Date.now();
    const windowStart = now - windowHours * 60 * 60 * 1000;

    // Query boluses (contains both insulin and carbs)
    const boluses = (await this.queryByTypeAndTimeRange(
      "bolus",
      windowStart,
      now
    )) as BolusRecord[];

    // Query standalone carbs
    const standaloneCarbs = (await this.queryByTypeAndTimeRange(
      "carbs",
      windowStart,
      now
    )) as CarbsRecord[];

    // Query manual insulin
    const manualInsulin = (await this.queryByTypeAndTimeRange(
      "manual_insulin",
      windowStart,
      now
    )) as ManualInsulinRecord[];

    // Aggregate
    const treatments: TreatmentSummary["treatments"] = [];

    // Process boluses
    for (const bolus of boluses) {
      if (bolus.insulinDeliveredUnits > 0) {
        treatments.push({
          timestamp: bolus.timestamp,
          type: "insulin",
          value: bolus.insulinDeliveredUnits,
        });
      }
      if (bolus.carbsInputGrams > 0) {
        treatments.push({
          timestamp: bolus.timestamp,
          type: "carbs",
          value: bolus.carbsInputGrams,
        });
      }
    }

    // Process standalone carbs
    for (const carb of standaloneCarbs) {
      treatments.push({
        timestamp: carb.timestamp,
        type: "carbs",
        value: carb.carbsGrams,
      });
    }

    // Process manual insulin
    for (const insulin of manualInsulin) {
      treatments.push({
        timestamp: insulin.timestamp,
        type: "insulin",
        value: insulin.units,
      });
    }

    // Sort by timestamp
    treatments.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate totals
    const totalInsulinUnits = treatments
      .filter((t) => t.type === "insulin")
      .reduce((sum, t) => sum + t.value, 0);

    const totalCarbsGrams = treatments
      .filter((t) => t.type === "carbs")
      .reduce((sum, t) => sum + t.value, 0);

    return {
      windowStartMs: windowStart,
      windowEndMs: now,
      totalInsulinUnits,
      totalCarbsGrams,
      bolusCount: boluses.length,
      treatments,
    };
  }

  /**
   * Store import metadata
   */
  async storeImportMetadata(metadata: ImportMetadata): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `USER#${this.userId}#IMPORT`,
          sk: `${metadata.startedAt}#${metadata.importId}`,
          data: metadata,
          gsi1pk: `USER#${this.userId}`,
          gsi1sk: `IMPORT#${metadata.startedAt}`,
        },
      })
    );
  }

  /**
   * Get recent import history
   */
  async getRecentImports(limit: number = 10): Promise<ImportMetadata[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": `USER#${this.userId}#IMPORT`,
        },
        Limit: limit,
        ScanIndexForward: false, // Most recent first
      })
    );

    return (result.Items || []).map((item) => item.data as ImportMetadata);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a storage instance from SST Resource
 */
export function createStorage(tableName: string, userId: string): GlookoStorage {
  return new GlookoStorage(tableName, userId);
}
