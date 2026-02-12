/**
 * DynamoDB storage operations for AI-generated insights
 */

import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Insight, StoredInsight, InsightType } from "../models/index.js";
import { generateInsightKeys } from "./keys.js";
import { randomUUID } from "crypto";

/**
 * Store a new insight (updates current and appends to history)
 */
export async function storeInsight(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  type: InsightType,
  content: string,
  metrics?: Insight["metrics"],
  reasoning?: string
): Promise<{ insightId: string }> {
  const now = Date.now();
  const insightId = randomUUID();

  const insight: StoredInsight = {
    userId,
    insightId,
    content,
    type,
    generatedAt: now,
    metrics,
    reasoning,
  };

  // Update current insight (singleton)
  const currentKeys = generateInsightKeys(userId, "CURRENT");
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...currentKeys,
        ...insight,
      },
    })
  );

  // Append to history
  const historyKeys = generateInsightKeys(userId, "HISTORY", now);
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...historyKeys,
        ...insight,
      },
    })
  );

  return { insightId };
}

/**
 * Get the current (most recent) insight
 */
export async function getCurrentInsight(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string
): Promise<StoredInsight | null> {
  const keys = generateInsightKeys(userId, "CURRENT");

  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: keys.pk, sk: keys.sk },
    })
  );

  if (!result.Item) return null;

  return result.Item as StoredInsight;
}

/**
 * Get insight history for a time range
 */
export async function getInsightHistory(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  days: number = 7
): Promise<StoredInsight[]> {
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;

  const startTs = startTime.toString().padStart(15, "0");
  const endTs = now.toString().padStart(15, "0");

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": `USR#${userId}#INSIGHT#HISTORY`,
        ":start": startTs,
        ":end": endTs,
      },
      ScanIndexForward: false, // Most recent first
    })
  );

  return (result.Items || []) as StoredInsight[];
}

/**
 * Update the current insight with reasoning extracted from agent response
 */
export async function updateCurrentInsightReasoning(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  reasoning: string
): Promise<void> {
  const keys = generateInsightKeys(userId, "CURRENT");

  // Update current insight
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: keys.pk, sk: keys.sk },
      UpdateExpression: "SET reasoning = :reasoning",
      ExpressionAttributeValues: {
        ":reasoning": reasoning,
      },
    })
  );

  // Also update the history record (get current first to find the timestamp)
  const current = await getCurrentInsight(docClient, tableName, userId);
  if (current) {
    const historyKeys = generateInsightKeys(userId, "HISTORY", current.generatedAt);
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: historyKeys.pk, sk: historyKeys.sk },
        UpdateExpression: "SET reasoning = :reasoning",
        ExpressionAttributeValues: {
          ":reasoning": reasoning,
        },
      })
    );
  }
}

/**
 * Get recent insight content strings for dedup checking
 * Returns just the content strings from the last N hours
 */
export async function getRecentInsightContents(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  hours: number = 6
): Promise<string[]> {
  const now = Date.now();
  const startTime = now - hours * 60 * 60 * 1000;

  const startTs = startTime.toString().padStart(15, "0");
  const endTs = now.toString().padStart(15, "0");

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": `USR#${userId}#INSIGHT#HISTORY`,
        ":start": startTs,
        ":end": endTs,
      },
      ProjectionExpression: "content",
      ScanIndexForward: false,
    })
  );

  return (result.Items || []).map((item) => (item as { content: string }).content);
}

/**
 * Check if an insight is stale (older than threshold)
 */
export function isInsightStale(insight: Insight, thresholdHours: number = 2): boolean {
  const ageMs = Date.now() - insight.generatedAt;
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  return ageMs > thresholdMs;
}

/**
 * Get insight staleness status
 */
export function getInsightStatus(
  insight: Insight | null
): "fresh" | "stale" | "very_stale" | "unavailable" {
  if (!insight) return "unavailable";

  const ageHours = (Date.now() - insight.generatedAt) / (1000 * 60 * 60);

  if (ageHours <= 2) return "fresh";
  if (ageHours <= 6) return "stale";
  return "very_stale";
}
