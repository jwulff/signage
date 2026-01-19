/**
 * Oura Ring integration types
 */

/**
 * User profile stored in DynamoDB
 * pk: OURA_USER#{userId}
 * sk: PROFILE
 */
export interface OuraUser {
  userId: string;
  displayName: string;
  initial: string; // Single character to display (e.g., "J", "S")
  ouraUserId?: string; // Oura's internal user ID
  createdAt: number;
  needsReauth?: boolean;
}

/**
 * OAuth tokens stored in DynamoDB
 * pk: OURA_USER#{userId}
 * sk: TOKENS
 */
export interface OuraTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp when access token expires
  scope: string;
}

/**
 * Readiness contributors from Oura API
 */
export interface ReadinessContributors {
  activityBalance?: number;
  bodyTemperature?: number;
  hrvBalance?: number;
  previousDayActivity?: number;
  previousNight?: number;
  recoveryIndex?: number;
  restingHeartRate?: number;
  sleepBalance?: number;
}

/**
 * Cached readiness score stored in DynamoDB
 * pk: OURA_USER#{userId}
 * sk: READINESS#{date} (date format: YYYY-MM-DD)
 */
export interface OuraReadiness {
  date: string; // YYYY-MM-DD
  score: number; // 0-100
  contributors: ReadinessContributors;
  fetchedAt: number; // Unix timestamp
}

/**
 * Active users list stored in DynamoDB
 * pk: OURA_USERS
 * sk: LIST
 */
export interface OuraUsersList {
  userIds: string[];
}

// Note: ReadinessDisplayData is defined in rendering/readiness-renderer.ts
// to avoid circular dependencies and keep rendering types together

/**
 * Oura API response for daily readiness
 */
export interface OuraReadinessApiResponse {
  data: Array<{
    id: string;
    day: string;
    score: number;
    contributors: {
      activity_balance: number;
      body_temperature: number;
      hrv_balance: number;
      previous_day_activity: number;
      previous_night: number;
      recovery_index: number;
      resting_heart_rate: number;
      sleep_balance: number;
    };
  }>;
}

/**
 * Oura API response for token refresh
 */
export interface OuraTokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Oura API response for user info
 */
export interface OuraUserInfoResponse {
  id: string;
  email: string;
  age?: number;
}

/**
 * DynamoDB item types for type guards
 */
export interface OuraUserItem {
  pk: string;
  sk: string;
  userId: string;
  displayName: string;
  initial: string;
  ouraUserId?: string;
  createdAt: number;
  needsReauth?: boolean;
}

export interface OuraTokensItem {
  pk: string;
  sk: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  ttl?: number; // DynamoDB TTL
}

export interface OuraReadinessItem {
  pk: string;
  sk: string;
  date: string;
  score: number;
  contributors: ReadinessContributors;
  fetchedAt: number;
  ttl?: number; // DynamoDB TTL
}

export interface OuraUsersListItem {
  pk: string;
  sk: string;
  userIds: string[];
}
