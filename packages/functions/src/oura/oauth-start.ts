/**
 * Oura OAuth Start Handler
 * Initiates OAuth flow by redirecting to Oura authorization page
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomBytes } from "crypto";

const OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const OURA_SCOPES = "daily personal";

// State TTL: 10 minutes
const STATE_TTL_SECONDS = 10 * 60;

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

export const handler: APIGatewayProxyHandlerV2 = async (event): Promise<APIGatewayProxyResultV2> => {
  try {
    // Get display name from query params
    const displayName = event.queryStringParameters?.name;
    if (!displayName) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing 'name' query parameter" }),
      };
    }

    // Validate display name (1-20 chars, alphanumeric + spaces)
    if (!/^[a-zA-Z0-9 ]{1,20}$/.test(displayName)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Invalid name. Use 1-20 alphanumeric characters.",
        }),
      };
    }

    // Generate initial from display name (first letter, uppercase)
    const initial = displayName.trim().charAt(0).toUpperCase();

    // Generate secure random state
    const state = randomBytes(32).toString("hex");

    // Store state with display name for callback verification
    const ttl = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS;
    await ddb.send(
      new PutCommand({
        TableName: Resource.SignageTable.name,
        Item: {
          pk: `OURA_STATE#${state}`,
          sk: "STATE",
          displayName,
          initial,
          createdAt: Date.now(),
          ttl,
        },
      })
    );

    // Build redirect URI from current request
    // Note: Custom domains don't include stage in path
    const host = event.requestContext.domainName;
    const redirectUri = `https://${host}/oura/auth/callback`;

    // Build Oura authorization URL
    // @ts-expect-error - OuraClientId is defined in SST secrets, types generated at deploy time
    const clientId = Resource.OuraClientId.value;
    const authUrl = new URL(OURA_AUTH_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", OURA_SCOPES);
    authUrl.searchParams.set("state", state);

    console.log(`OAuth start: redirecting ${displayName} (${initial}) to Oura`);

    return {
      statusCode: 302,
      headers: { Location: authUrl.toString() },
      body: "",
    };
  } catch (error) {
    console.error("OAuth start error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
