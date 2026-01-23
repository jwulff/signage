/**
 * Oura Data Fetch Handler
 * Hourly cron job (7 AM - 12 PM Pacific) that fetches readiness and sleep scores.
 * Skips users who already have complete data for today, allowing retries until data is available.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { ScheduledHandler } from "aws-lambda";
import { fetchAndCacheOuraData, getValidAccessToken, getCachedReadiness, getCachedSleep } from "./client.js";
import type { OuraUsersListItem, OuraUserItem } from "./types.js";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

/**
 * Get list of active Oura users
 */
async function getActiveUsers(): Promise<string[]> {
  const result = await ddb.send(
    new GetCommand({
      TableName: Resource.SignageTable.name,
      Key: {
        pk: "OURA_USERS",
        sk: "LIST",
      },
    })
  );

  if (!result.Item) {
    return [];
  }

  const item = result.Item as OuraUsersListItem;
  return item.userIds || [];
}

/**
 * Get user profile
 */
async function getUserProfile(userId: string): Promise<OuraUserItem | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: Resource.SignageTable.name,
      Key: {
        pk: `OURA_USER#${userId}`,
        sk: "PROFILE",
      },
    })
  );

  return result.Item as OuraUserItem | null;
}

/**
 * Mark a user as needing re-authentication
 */
async function markNeedsReauth(userId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.SignageTable.name,
        Key: {
          pk: `OURA_USER#${userId}`,
          sk: "PROFILE",
        },
        UpdateExpression: "SET needsReauth = :true",
        ExpressionAttributeValues: {
          ":true": true,
        },
      })
    );
  } catch (error) {
    console.error(`Failed to mark user ${userId} as needing reauth:`, error);
  }
}

/**
 * Get today's date in Pacific timezone (YYYY-MM-DD format)
 */
function getTodayPacific(): string {
  const now = new Date();
  const pacificDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return pacificDate.toISOString().split("T")[0];
}

/**
 * Check if a user already has both readiness and sleep data for today
 */
async function hasCompleteDataForToday(userId: string, today: string): Promise<boolean> {
  const [readiness, sleep] = await Promise.all([
    getCachedReadiness(userId, today),
    getCachedSleep(userId, today),
  ]);
  return readiness !== null && sleep !== null;
}

/**
 * Scheduled handler - fetches readiness and sleep for all users
 * Runs hourly and skips users who already have complete data for today
 */
export const scheduled: ScheduledHandler = async () => {
  const today = getTodayPacific();
  console.log(`Starting Oura data fetch for ${today}`);

  const userIds = await getActiveUsers();
  console.log(`Found ${userIds.length} active users`);

  if (userIds.length === 0) {
    console.log("No users to fetch, exiting");
    return;
  }

  const results = {
    success: 0,
    partialData: 0,
    noData: 0,
    failed: 0,
    needsReauth: 0,
    skipped: 0,
  };

  for (const userId of userIds) {
    try {
      // Get user profile for logging
      const profile = await getUserProfile(userId);
      const name = profile?.displayName || "Unknown";

      // Check if we already have complete data for today (skip if so)
      if (await hasCompleteDataForToday(userId, today)) {
        console.log(`Skipping ${name} - already has complete data for ${today}`);
        results.skipped++;
        continue;
      }

      // Check if user has valid token
      const token = await getValidAccessToken(userId);
      if (!token) {
        console.log(`User ${name} (${userId}) needs re-authentication`);
        await markNeedsReauth(userId);
        results.needsReauth++;
        continue;
      }

      // Fetch and cache readiness and sleep
      const { readiness, sleep } = await fetchAndCacheOuraData(userId);

      if (readiness && sleep) {
        console.log(`Fetched data for ${name}: readiness=${readiness.score}, sleep=${sleep.score}`);
        results.success++;
      } else if (readiness || sleep) {
        console.log(`Partial data for ${name}: readiness=${readiness?.score ?? "none"}, sleep=${sleep?.score ?? "none"}`);
        results.partialData++;
      } else {
        console.log(`No data for ${name}`);
        results.noData++;
      }
    } catch (error) {
      console.error(`Failed to fetch data for user ${userId}:`, error);
      results.failed++;
    }

    // Add small delay between users to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("Oura data fetch complete:", results);
};
