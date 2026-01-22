/**
 * Oura Data Fetch Handler
 * Daily cron job that fetches readiness and sleep scores for all linked users
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { ScheduledHandler } from "aws-lambda";
import { fetchAndCacheOuraData, getValidAccessToken } from "./client.js";
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
 * Scheduled handler - fetches readiness and sleep for all users
 */
export const scheduled: ScheduledHandler = async () => {
  console.log("Starting Oura data fetch");

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
  };

  for (const userId of userIds) {
    try {
      // Get user profile for logging
      const profile = await getUserProfile(userId);
      const name = profile?.displayName || "Unknown";

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
