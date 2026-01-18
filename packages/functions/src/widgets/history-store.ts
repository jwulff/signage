/**
 * Widget History Store
 * DynamoDB operations for time-series data storage with TTL.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type {
  TimeSeriesPoint,
  WidgetHistoryConfig,
  WidgetHistoryMeta,
} from "./types";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

/** Maximum items per DynamoDB batch write */
const BATCH_WRITE_LIMIT = 25;

/**
 * Build the partition key for widget history.
 */
function historyPk(widgetId: string): string {
  return `WIDGET#${widgetId}#HISTORY`;
}

/**
 * Build the sort key for a time-series point.
 */
function timestampSk(timestamp: number): string {
  return `TS#${new Date(timestamp).toISOString()}`;
}

/**
 * Calculate TTL value in epoch seconds.
 */
export function calculateTTL(retentionHours: number): number {
  return Math.floor(Date.now() / 1000) + retentionHours * 3600;
}

/**
 * Store a single data point in the history table.
 */
export async function storeDataPoint<T>(
  widgetId: string,
  point: TimeSeriesPoint<T>,
  config: WidgetHistoryConfig
): Promise<void> {
  const pk = historyPk(widgetId);
  const sk = timestampSk(point.timestamp);

  await ddb.send(
    new PutCommand({
      TableName: Resource.SignageTable.name,
      Item: {
        pk,
        sk,
        timestamp: point.timestamp,
        value: point.value,
        ...(point.meta && { meta: point.meta }),
        ttl: calculateTTL(config.retentionHours),
      },
    })
  );

  // Update metadata with latest timestamp
  await updateHistoryMeta(widgetId, point.timestamp);
}

/**
 * Store multiple data points in batch.
 * Handles DynamoDB's 25-item batch limit automatically.
 */
export async function storeDataPoints<T>(
  widgetId: string,
  points: TimeSeriesPoint<T>[],
  config: WidgetHistoryConfig
): Promise<{ stored: number; batches: number }> {
  if (points.length === 0) {
    return { stored: 0, batches: 0 };
  }

  const pk = historyPk(widgetId);
  const ttl = calculateTTL(config.retentionHours);

  // Build all put requests
  const putRequests = points.map((point) => ({
    PutRequest: {
      Item: {
        pk,
        sk: timestampSk(point.timestamp),
        timestamp: point.timestamp,
        value: point.value,
        ...(point.meta && { meta: point.meta }),
        ttl,
      },
    },
  }));

  // Split into batches of 25
  let batchCount = 0;
  for (let i = 0; i < putRequests.length; i += BATCH_WRITE_LIMIT) {
    const batch = putRequests.slice(i, i + BATCH_WRITE_LIMIT);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [Resource.SignageTable.name]: batch,
        },
      })
    );
    batchCount++;
  }

  // Update metadata with the latest timestamp from the batch
  const latestTimestamp = Math.max(...points.map((p) => p.timestamp));
  await updateHistoryMeta(widgetId, latestTimestamp, points.length);

  return { stored: points.length, batches: batchCount };
}

/**
 * Query history points within a time range.
 */
export async function queryHistory<T>(
  widgetId: string,
  since: number,
  until: number = Date.now()
): Promise<TimeSeriesPoint<T>[]> {
  const pk = historyPk(widgetId);
  const sinceSk = timestampSk(since);
  const untilSk = timestampSk(until);

  const result = await ddb.send(
    new QueryCommand({
      TableName: Resource.SignageTable.name,
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :since AND :until",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":since": sinceSk,
        ":until": untilSk,
      },
      ScanIndexForward: true, // Chronological order
    })
  );

  return (result.Items || []).map((item) => ({
    timestamp: item.timestamp as number,
    value: item.value as T,
    ...(item.meta && { meta: item.meta as Record<string, unknown> }),
  }));
}

/**
 * Get the history metadata record.
 */
export async function getHistoryMeta(
  widgetId: string
): Promise<WidgetHistoryMeta | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: Resource.SignageTable.name,
      Key: { pk: historyPk(widgetId), sk: "META" },
    })
  );

  return (result.Item as WidgetHistoryMeta) || null;
}

/**
 * Update the history metadata record.
 */
async function updateHistoryMeta(
  widgetId: string,
  latestTimestamp: number,
  pointsAdded: number = 1
): Promise<void> {
  const pk = historyPk(widgetId);
  const now = Date.now();

  // Get existing meta to update totalPointsStored
  const existing = await getHistoryMeta(widgetId);
  const newTotal = (existing?.totalPointsStored || 0) + pointsAdded;

  await ddb.send(
    new PutCommand({
      TableName: Resource.SignageTable.name,
      Item: {
        pk,
        sk: "META",
        widgetId,
        lastDataPointAt: latestTimestamp,
        lastBackfillAt: now,
        totalPointsStored: newTotal,
      },
    })
  );
}

/**
 * Check if backfill is needed based on the gap since last data point.
 */
export async function needsBackfill(
  widgetId: string,
  config: WidgetHistoryConfig
): Promise<{ needed: boolean; gapMinutes: number; since?: number }> {
  const meta = await getHistoryMeta(widgetId);

  if (!meta?.lastDataPointAt) {
    // No history exists, need full backfill
    const since = Date.now() - config.backfillDepthHours * 60 * 60 * 1000;
    return { needed: true, gapMinutes: Infinity, since };
  }

  const gapMs = Date.now() - meta.lastDataPointAt;
  const gapMinutes = gapMs / 60000;

  if (gapMinutes >= config.backfillThresholdMinutes) {
    // Calculate since: max of lastDataPointAt and (now - backfillDepthHours)
    const maxBackfillSince =
      Date.now() - config.backfillDepthHours * 60 * 60 * 1000;
    const since = Math.max(meta.lastDataPointAt, maxBackfillSince);
    return { needed: true, gapMinutes, since };
  }

  return { needed: false, gapMinutes };
}

/**
 * Check if a timestamp falls within the dedupe window of existing data.
 * Used to prevent storing duplicate points.
 */
export async function isDuplicate(
  widgetId: string,
  timestamp: number,
  dedupeWindowMinutes: number
): Promise<boolean> {
  const windowMs = dedupeWindowMinutes * 60 * 1000;
  const since = timestamp - windowMs;
  const until = timestamp + windowMs;

  const existing = await queryHistory(widgetId, since, until);
  return existing.some(
    (p) => Math.abs(p.timestamp - timestamp) < windowMs
  );
}
