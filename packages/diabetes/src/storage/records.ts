/**
 * DynamoDB storage operations for diabetes records
 */

import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DiabetesRecord, DiabetesRecordType } from "../models/index.js";
import { generateRecordKeys, formatDateInTimezone, DATA_TIMEZONE } from "./keys.js";

/**
 * Maximum batch size for DynamoDB writes
 */
const MAX_BATCH_SIZE = 25;

/**
 * Result of a batch write operation
 */
export interface WriteResult {
  written: number;
  duplicates: number;
  errors: string[];
}

/**
 * DynamoDB item for a diabetes record
 */
export interface RecordItem {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  gsi2pk?: string;
  gsi2sk?: string;
  data: DiabetesRecord;
  ttl?: number;
}

/**
 * Store multiple records with idempotent writes
 */
export async function storeRecords(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  records: DiabetesRecord[]
): Promise<WriteResult> {
  const items: RecordItem[] = records.map((record) => {
    const keys = generateRecordKeys(userId, record);
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

    const writePromises = batch.map(async (item) => {
      try {
        const record = item.data;
        const isDailyInsulin = record.type === "daily_insulin";

        if (isDailyInsulin) {
          // Conditional upsert - only write if new value is higher
          await docClient.send(
            new PutCommand({
              TableName: tableName,
              Item: item,
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
          // Strict deduplication for other types
          await docClient.send(
            new PutCommand({
              TableName: tableName,
              Item: item,
              ConditionExpression: "attribute_not_exists(pk)",
            })
          );
          return { status: "written" as const };
        }
      } catch (error: unknown) {
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "ConditionalCheckFailedException"
        ) {
          return { status: "duplicate" as const };
        }
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { status: "error" as const, error: errorMsg };
      }
    });

    const results = await Promise.all(writePromises);

    for (const result of results) {
      if (result.status === "written") written++;
      else if (result.status === "duplicate") duplicates++;
      else if (result.status === "error") errors.push(result.error);
    }
  }

  return { written, duplicates, errors };
}

/**
 * Query records by type and date range (uses v2 date-partitioned schema)
 */
export async function queryByTypeAndDateRange(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  recordType: DiabetesRecordType,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  limit?: number
): Promise<DiabetesRecord[]> {
  // Use GSI2 for type-based date range queries
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "gsi2pk = :pk AND gsi2sk BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": `USR#${userId}#${recordType.toUpperCase()}`,
        ":start": startDate,
        ":end": endDate + "~",
      },
      Limit: limit,
      ScanIndexForward: false,
    })
  );

  return (result.Items || []).map((item) => item.data as DiabetesRecord);
}

/**
 * Query records by type and time range (for backward compatibility)
 */
export async function queryByTypeAndTimeRange(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  recordType: DiabetesRecordType,
  startTime: number,
  endTime: number,
  limit?: number
): Promise<DiabetesRecord[]> {
  const startDate = formatDateInTimezone(startTime, DATA_TIMEZONE);
  const endDate = formatDateInTimezone(endTime, DATA_TIMEZONE);

  return queryByTypeAndDateRange(
    docClient,
    tableName,
    userId,
    recordType,
    startDate,
    endDate,
    limit
  );
}

/**
 * Query daily insulin totals by date range
 */
export async function queryDailyInsulinByDateRange(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "gsi2pk = :pk AND gsi2sk BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": `USR#${userId}#DAILY_INSULIN`,
        ":start": startDate,
        ":end": endDate + "~",
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
 * Query all record types in a time range (cross-type query via GSI1)
 */
export async function queryAllTypesByTimeRange(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  startTime: number,
  endTime: number,
  limit?: number
): Promise<DiabetesRecord[]> {
  const startTs = startTime.toString().padStart(15, "0");
  const endTs = endTime.toString().padStart(15, "0");

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "gsi1pk = :pk AND gsi1sk BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": `USR#${userId}#ALL`,
        ":start": startTs,
        ":end": endTs,
      },
      Limit: limit,
      ScanIndexForward: false,
    })
  );

  return (result.Items || []).map((item) => item.data as DiabetesRecord);
}
