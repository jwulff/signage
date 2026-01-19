/**
 * Oura OAuth Callback Handler
 * Handles OAuth callback, exchanges code for tokens, and stores user
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { exchangeCodeForTokens, saveTokens, fetchUserInfo } from "./client.js";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

// Allowed hosts for OAuth redirect (defense-in-depth)
const ALLOWED_HOSTS = [
  "api.signage.example.com", // Production
  /^api\.[a-z0-9-]+\.signage\.example\.com$/, // Staging: api.{stage}.signage.example.com
  /^[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/, // API Gateway default domains
];

function isAllowedHost(host: string): boolean {
  return ALLOWED_HOSTS.some((allowed) =>
    typeof allowed === "string" ? allowed === host : allowed.test(host)
  );
}

interface StoredState {
  pk: string;
  sk: string;
  displayName: string;
  initial: string;
  createdAt: number;
  ttl: number;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;
    const error = event.queryStringParameters?.error;

    // Handle OAuth errors
    if (error) {
      console.error(`OAuth error: ${error}`);
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html" },
        body: `
          <!DOCTYPE html>
          <html>
          <head><title>Link Failed</title></head>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Link Failed</h1>
            <p>Authorization was denied or an error occurred.</p>
            <p>Error: ${error}</p>
            <a href="/">Try again</a>
          </body>
          </html>
        `,
      };
    }

    // Validate required params
    if (!code || !state) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing code or state parameter" }),
      };
    }

    // Verify state exists and get associated data
    const stateResult = await ddb.send(
      new GetCommand({
        TableName: Resource.SignageTable.name,
        Key: {
          pk: `OURA_STATE#${state}`,
          sk: "STATE",
        },
      })
    );

    if (!stateResult.Item) {
      console.error("Invalid or expired state");
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html" },
        body: `
          <!DOCTYPE html>
          <html>
          <head><title>Link Failed</title></head>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Link Failed</h1>
            <p>The link request has expired. Please try again.</p>
            <a href="/">Start over</a>
          </body>
          </html>
        `,
      };
    }

    const storedState = stateResult.Item as StoredState;

    // Check if state has expired (DynamoDB TTL is eventual, can take hours)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (storedState.ttl && storedState.ttl < nowSeconds) {
      console.error("OAuth state expired");
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html" },
        body: `
          <!DOCTYPE html>
          <html>
          <head><title>Link Failed</title></head>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Link Failed</h1>
            <p>The link request has expired. Please try again.</p>
            <a href="/">Start over</a>
          </body>
          </html>
        `,
      };
    }

    const { displayName, initial } = storedState;

    // Delete used state
    await ddb.send(
      new DeleteCommand({
        TableName: Resource.SignageTable.name,
        Key: {
          pk: `OURA_STATE#${state}`,
          sk: "STATE",
        },
      })
    );

    // Build redirect URI (must match what was used in oauth-start)
    // Note: Custom domains don't include stage in path
    const host = event.requestContext.domainName;

    // Validate host against allow-list (defense-in-depth)
    if (!host || !isAllowedHost(host)) {
      console.error(`Invalid host in OAuth callback: ${host}`);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid request origin" }),
      };
    }

    const redirectUri = `https://${host}/oura/auth/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Fetch user info from Oura
    const userInfo = await fetchUserInfo(tokens.accessToken);
    const ouraUserId = userInfo.id;

    // Generate internal user ID
    const userId = randomUUID();

    // Save user profile
    await ddb.send(
      new PutCommand({
        TableName: Resource.SignageTable.name,
        Item: {
          pk: `OURA_USER#${userId}`,
          sk: "PROFILE",
          userId,
          displayName,
          initial,
          ouraUserId,
          createdAt: Date.now(),
        },
      })
    );

    // Save tokens
    await saveTokens(userId, tokens);

    // Add user to active users list
    await addToUsersList(userId);

    console.log(`OAuth complete: ${displayName} (${userId}) linked successfully`);

    // Return success page
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Account Linked</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background: #0d1117;
              color: #c9d1d9;
              padding: 40px;
              text-align: center;
            }
            .success {
              background: #238636;
              color: white;
              padding: 20px 40px;
              border-radius: 8px;
              display: inline-block;
              margin: 20px 0;
            }
            .initial {
              font-size: 48px;
              background: #21262d;
              width: 80px;
              height: 80px;
              line-height: 80px;
              border-radius: 50%;
              margin: 20px auto;
            }
          </style>
        </head>
        <body>
          <div class="initial">${initial}</div>
          <div class="success">
            <h1>Account Linked!</h1>
            <p>${displayName}'s Oura Ring is now connected.</p>
          </div>
          <p>Your readiness score will appear on the display.</p>
          <p style="color: #8b949e; font-size: 14px;">You can close this window.</p>
        </body>
        </html>
      `,
    };
  } catch (error) {
    console.error("OAuth callback error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Link Failed</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Link Failed</h1>
          <p>An unexpected error occurred. Please try again.</p>
          <a href="/">Start over</a>
        </body>
        </html>
      `,
    };
  }
};

/**
 * Add a user to the active users list
 */
async function addToUsersList(userId: string): Promise<void> {
  try {
    // Use UpdateCommand to append to the list atomically
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.SignageTable.name,
        Key: {
          pk: "OURA_USERS",
          sk: "LIST",
        },
        UpdateExpression:
          "SET userIds = list_append(if_not_exists(userIds, :empty), :newUser)",
        ExpressionAttributeValues: {
          ":empty": [],
          ":newUser": [userId],
        },
      })
    );
  } catch (error) {
    console.error("Failed to add user to list:", error);
    // Non-fatal error, user is still created
  }
}
