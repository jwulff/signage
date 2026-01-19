/**
 * Oura Readiness Fetch Handler
 * Daily cron job that fetches readiness scores for all linked users
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { ScheduledHandler } from "aws-lambda";
import { fetchAndCacheReadiness, getValidAccessToken } from "./client.js";
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
 * Scheduled handler - fetches readiness for all users
 */
export const scheduled: ScheduledHandler = async () => {
  console.log("Starting Oura readiness fetch");

  const userIds = await getActiveUsers();
  console.log(`Found ${userIds.length} active users`);

  if (userIds.length === 0) {
    console.log("No users to fetch, exiting");
    return;
  }

  const results = {
    success: 0,
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

      // Fetch and cache readiness
      const readiness = await fetchAndCacheReadiness(userId);

      if (readiness) {
        console.log(`Fetched readiness for ${name}: ${readiness.score}`);
        results.success++;
      } else {
        console.log(`No readiness data for ${name}`);
        results.noData++;
      }
    } catch (error) {
      console.error(`Failed to fetch readiness for user ${userId}:`, error);
      results.failed++;
    }

    // Add small delay between users to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("Oura readiness fetch complete:", results);
};
