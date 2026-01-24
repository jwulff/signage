/**
 * Dexcom Share API Client
 *
 * Shared client for authenticating and fetching glucose readings
 * from the Dexcom Share API (US region).
 */

/** Dexcom Share API endpoints (US region) */
export const DEXCOM_BASE_URL =
  "https://share2.dexcom.com/ShareWebServices/Services";
export const DEXCOM_APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";

/** Credentials for Dexcom Share authentication */
export interface DexcomCredentials {
  username: string;
  password: string;
}

/** Raw glucose reading from Dexcom API */
export interface DexcomReading {
  /** Timestamp in Dexcom format: "Date(1234567890000)" */
  WT: string;
  /** System time */
  ST: string;
  /** Display time */
  DT: string;
  /** Glucose value in mg/dL */
  Value: number;
  /** Trend direction (e.g., "Flat", "SingleUp", "FortyFiveDown") */
  Trend: string;
}

/**
 * Parse Dexcom timestamp format "Date(1234567890000)" to milliseconds.
 */
export function parseDexcomTimestamp(wt: string): number {
  const match = wt.match(/Date\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Authenticate with Dexcom Share and get a session ID.
 *
 * Two-step process:
 * 1. Authenticate with username/password to get account ID
 * 2. Login with account ID to get session ID
 */
export async function getSessionId(
  credentials: DexcomCredentials
): Promise<string> {
  const { username, password } = credentials;

  console.log(
    `Authenticating with username: ${username.slice(0, 3)}***, password starts with: ${password.slice(0, 2)}*** (len=${password.length})`
  );

  // Step 1: Get account ID
  const authResponse = await fetch(
    `${DEXCOM_BASE_URL}/General/AuthenticatePublisherAccount`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        accountName: username,
        password: password,
        applicationId: DEXCOM_APP_ID,
      }),
    }
  );

  if (!authResponse.ok) {
    const errorText = await authResponse.text().catch(() => "");
    if (errorText) {
      console.error("Dexcom auth error response: " + errorText);
    }
    throw new Error(`Dexcom auth failed: ${authResponse.status}`);
  }

  const accountId = (await authResponse.json()) as string;

  // Step 2: Get session ID
  const sessionResponse = await fetch(
    `${DEXCOM_BASE_URL}/General/LoginPublisherAccountById`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        accountId,
        password,
        applicationId: DEXCOM_APP_ID,
      }),
    }
  );

  if (!sessionResponse.ok) {
    throw new Error(`Dexcom login failed: ${sessionResponse.status}`);
  }

  return sessionResponse.json() as Promise<string>;
}

/**
 * Fetch glucose readings from Dexcom Share.
 *
 * @param sessionId - Session ID from getSessionId()
 * @param minutes - Time window in minutes (max 1440 = 24 hours)
 * @param maxCount - Maximum number of readings to return
 * @returns Array of readings, newest first
 */
export async function fetchGlucoseReadings(
  sessionId: string,
  minutes: number = 30,
  maxCount: number = 2
): Promise<DexcomReading[]> {
  const response = await fetch(
    `${DEXCOM_BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=${minutes}&maxCount=${maxCount}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Dexcom fetch failed: ${response.status}`);
  }

  return response.json() as Promise<DexcomReading[]>;
}
