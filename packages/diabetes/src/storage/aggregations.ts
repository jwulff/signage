/**
 * DynamoDB storage operations for pre-computed aggregations
 */

import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { generateAggregationKeys } from "./keys.js";

/**
 * Daily aggregation data structure
 */
export interface DailyAggregation {
  date: string; // YYYY-MM-DD
  glucose: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    cv: number; // coefficient of variation
    tir: number; // time in range percentage
    readings: number;
  };
  insulin: {
    totalBolus: number;
    totalBasal: number;
    bolusCount: number;
  };
  meals: {
    count: number;
    avgCarbsPerMeal: number;
    avgPostMealSpike: number;
  };
  patterns: {
    overnightLows: number;
    morningHighs: number;
    postMealSpikes: number;
  };
  computedAt: number;
}

/**
 * Weekly aggregation data structure
 */
export interface WeeklyAggregation {
  week: string; // YYYY-Wxx
  avgTir: number;
  tirTrend: number; // change from previous week
  avgDailyInsulin: number;
  insulinTrend: number;
  bestDay: string;
  worstDay: string;
  dominantPattern: string;
  computedAt: number;
}

/**
 * Store a daily aggregation
 */
export async function storeDailyAggregation(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  aggregation: DailyAggregation
): Promise<void> {
  const keys = generateAggregationKeys(userId, "DAILY", aggregation.date);

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...keys,
        data: aggregation,
      },
    })
  );
}

/**
 * Get a daily aggregation
 */
export async function getDailyAggregation(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  date: string
): Promise<DailyAggregation | null> {
  const keys = generateAggregationKeys(userId, "DAILY", date);

  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: keys.pk, sk: keys.sk },
    })
  );

  if (!result.Item) return null;
  return result.Item.data as DailyAggregation;
}

/**
 * Get daily aggregations for a date range
 */
export async function getDailyAggregations(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  startDate: string,
  endDate: string
): Promise<DailyAggregation[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :start AND :end",
      ExpressionAttributeValues: {
        ":pk": `USR#${userId}#AGG#DAILY`,
        ":start": startDate,
        ":end": endDate + "~",
      },
      ScanIndexForward: true, // Chronological order
    })
  );

  return (result.Items || []).map((item) => item.data as DailyAggregation);
}

/**
 * Store a weekly aggregation
 */
export async function storeWeeklyAggregation(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  aggregation: WeeklyAggregation
): Promise<void> {
  const keys = generateAggregationKeys(userId, "WEEKLY", aggregation.week);

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...keys,
        data: aggregation,
      },
    })
  );
}

/**
 * Get a weekly aggregation
 */
export async function getWeeklyAggregation(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  week: string
): Promise<WeeklyAggregation | null> {
  const keys = generateAggregationKeys(userId, "WEEKLY", week);

  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: keys.pk, sk: keys.sk },
    })
  );

  if (!result.Item) return null;
  return result.Item.data as WeeklyAggregation;
}
