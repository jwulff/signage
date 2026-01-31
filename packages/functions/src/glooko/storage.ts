/**
 * Glooko Data Storage
 *
 * Thin wrapper around @diabetes/core storage functions.
 * Maintains backward compatibility with existing Glooko scraper code.
 */

import {
  createDocClient,
  storeRecords as coreStoreRecords,
  queryByTypeAndTimeRange as coreQueryByTypeAndTimeRange,
  queryDailyInsulinByDateRange as coreQueryDailyInsulinByDateRange,
  type WriteResult,
} from "@diabetes/core";
import type {
  DiabetesRecord as GlookoRecord,
  DiabetesRecordType as GlookoRecordType,
  BolusRecord,
  CarbsRecord,
  ManualInsulinRecord,
} from "@diabetes/core";

// Re-export deprecated types for compatibility
import type { TreatmentSummary, ImportMetadata, GlookoRecordItem } from "./data-model.js";
export type { GlookoRecordItem };

import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

// =============================================================================
// Storage Class
// =============================================================================

export class GlookoStorage {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;
  private userId: string;

  constructor(tableName: string, userId: string) {
    this.docClient = createDocClient();
    this.tableName = tableName;
    this.userId = userId;
  }

  /**
   * Store multiple records with idempotent batch writes
   * Uses the new date-partitioned schema from @diabetes/core
   */
  async storeRecords(records: GlookoRecord[]): Promise<WriteResult> {
    return coreStoreRecords(this.docClient, this.tableName, this.userId, records);
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
    return coreQueryByTypeAndTimeRange(
      this.docClient,
      this.tableName,
      this.userId,
      recordType,
      startTime,
      endTime,
      limit
    );
  }

  /**
   * Query daily insulin totals by date range
   */
  async queryDailyInsulinByDateRange(
    startDate: string,
    endDate: string
  ): Promise<Record<string, number>> {
    return coreQueryDailyInsulinByDateRange(
      this.docClient,
      this.tableName,
      this.userId,
      startDate,
      endDate
    );
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
          pk: `USR#${this.userId}#IMPORT`,
          sk: `${metadata.startedAt}#${metadata.importId}`,
          data: metadata,
          gsi1pk: `USR#${this.userId}#ALL`,
          gsi1sk: metadata.startedAt.toString().padStart(15, "0"),
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
          ":pk": `USR#${this.userId}#IMPORT`,
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

/**
 * @deprecated Use generateRecordKeys from @diabetes/core instead
 */
export { generateRecordKeys } from "@diabetes/core";
