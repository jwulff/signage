/**
 * Oura Ring API client
 * Handles OAuth token refresh and API calls
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type {
  OuraTokens,
  OuraTokensItem,
  OuraReadiness,
  OuraReadinessApiResponse,
  OuraTokenRefreshResponse,
  OuraUserInfoResponse,
  ReadinessContributors,
} from "./types.js";

const OURA_API_BASE = "https://api.ouraring.com/v2";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

// Token expiry buffer: refresh 5 minutes before expiry
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Readiness data TTL: 7 days
const READINESS_TTL_SECONDS = 7 * 24 * 60 * 60;

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

/**
 * Get tokens from DynamoDB for a user
 */
export async function getTokens(userId: string): Promise<OuraTokens | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: Resource.SignageTable.name,
      Key: {
        pk: `OURA_USER#${userId}`,
        sk: "TOKENS",
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  const item = result.Item as OuraTokensItem;
  return {
    accessToken: item.accessToken,
    refreshToken: item.refreshToken,
    expiresAt: item.expiresAt,
    scope: item.scope,
  };
}

/**
 * Save tokens to DynamoDB
 */
export async function saveTokens(userId: string, tokens: OuraTokens): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: Resource.SignageTable.name,
      Item: {
        pk: `OURA_USER#${userId}`,
        sk: "TOKENS",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
      },
    })
  );
}

/**
 * Refresh OAuth tokens using refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<OuraTokens> {
  // @ts-expect-error - OuraClientId/OuraClientSecret defined in SST secrets, types generated at deploy time
  const clientId = Resource.OuraClientId.value;
  // @ts-expect-error - OuraClientId/OuraClientSecret defined in SST secrets, types generated at deploy time
  const clientSecret = Resource.OuraClientSecret.value;

  const response = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as OuraTokenRefreshResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokens = await getTokens(userId);
  if (!tokens) {
    return null;
  }

  // Check if token needs refresh
  if (Date.now() >= tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
    try {
      const newTokens = await refreshTokens(tokens.refreshToken);
      await saveTokens(userId, newTokens);
      return newTokens.accessToken;
    } catch (error) {
      console.error(`Failed to refresh tokens for user ${userId}:`, error);
      // Mark user as needing reauth
      await markUserNeedsReauth(userId);
      return null;
    }
  }

  return tokens.accessToken;
}

/**
 * Mark a user as needing re-authentication
 * Updates the needsReauth flag on the user's PROFILE item
 */
async function markUserNeedsReauth(userId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.SignageTable.name,
        Key: {
          pk: `OURA_USER#${userId}`,
          sk: "PROFILE",
        },
        UpdateExpression: "SET needsReauth = :needsReauth, needsReauthAt = :timestamp",
        ExpressionAttributeValues: {
          ":needsReauth": true,
          ":timestamp": Date.now(),
        },
      })
    );
  } catch (error) {
    console.error(`Failed to mark user ${userId} as needing reauth:`, error);
  }
}

/**
 * Fetch user info from Oura API
 */
export async function fetchUserInfo(accessToken: string): Promise<OuraUserInfoResponse> {
  const response = await fetch(`${OURA_API_BASE}/usercollection/personal_info`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch user info: ${response.status} - ${error}`);
  }

  return response.json() as Promise<OuraUserInfoResponse>;
}

/**
 * Fetch daily readiness from Oura API
 */
export async function fetchReadiness(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<OuraReadiness[]> {
  const url = new URL(`${OURA_API_BASE}/usercollection/daily_readiness`);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch readiness: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as OuraReadinessApiResponse;

  return data.data.map((item) => ({
    date: item.day,
    score: item.score,
    contributors: mapContributors(item.contributors),
    fetchedAt: Date.now(),
  }));
}

/**
 * Map Oura API contributors to our format
 */
function mapContributors(apiContributors: {
  activity_balance: number;
  body_temperature: number;
  hrv_balance: number;
  previous_day_activity: number;
  previous_night: number;
  recovery_index: number;
  resting_heart_rate: number;
  sleep_balance: number;
}): ReadinessContributors {
  return {
    activityBalance: apiContributors.activity_balance,
    bodyTemperature: apiContributors.body_temperature,
    hrvBalance: apiContributors.hrv_balance,
    previousDayActivity: apiContributors.previous_day_activity,
    previousNight: apiContributors.previous_night,
    recoveryIndex: apiContributors.recovery_index,
    restingHeartRate: apiContributors.resting_heart_rate,
    sleepBalance: apiContributors.sleep_balance,
  };
}

/**
 * Save readiness data to DynamoDB cache
 */
export async function cacheReadiness(
  userId: string,
  readiness: OuraReadiness
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + READINESS_TTL_SECONDS;

  await ddb.send(
    new PutCommand({
      TableName: Resource.SignageTable.name,
      Item: {
        pk: `OURA_USER#${userId}`,
        sk: `READINESS#${readiness.date}`,
        date: readiness.date,
        score: readiness.score,
        contributors: readiness.contributors,
        fetchedAt: readiness.fetchedAt,
        ttl,
      },
    })
  );
}

/**
 * Get cached readiness from DynamoDB
 */
export async function getCachedReadiness(
  userId: string,
  date: string
): Promise<OuraReadiness | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: Resource.SignageTable.name,
      Key: {
        pk: `OURA_USER#${userId}`,
        sk: `READINESS#${date}`,
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  const item = result.Item;
  return {
    date: item.date as string,
    score: item.score as number,
    contributors: item.contributors as ReadinessContributors,
    fetchedAt: item.fetchedAt as number,
  };
}

/**
 * Fetch and cache readiness for a user
 * Returns the readiness score or null if unavailable
 */
export async function fetchAndCacheReadiness(userId: string): Promise<OuraReadiness | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    console.log(`No valid access token for user ${userId}`);
    return null;
  }

  // Get today's date in user's local timezone (assume Pacific for now)
  const now = new Date();
  const pacificDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const today = pacificDate.toISOString().split("T")[0];

  try {
    const readinessData = await fetchReadiness(accessToken, today, today);

    if (readinessData.length > 0) {
      const readiness = readinessData[0];
      await cacheReadiness(userId, readiness);
      console.log(`Cached readiness for user ${userId}: ${readiness.score}`);
      return readiness;
    }

    console.log(`No readiness data for user ${userId} on ${today}`);
    return null;
  } catch (error) {
    console.error(`Failed to fetch readiness for user ${userId}:`, error);
    return null;
  }
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<OuraTokens> {
  // @ts-expect-error - OuraClientId/OuraClientSecret defined in SST secrets, types generated at deploy time
  const clientId = Resource.OuraClientId.value;
  // @ts-expect-error - OuraClientId/OuraClientSecret defined in SST secrets, types generated at deploy time
  const clientSecret = Resource.OuraClientSecret.value;

  const response = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as OuraTokenRefreshResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}
