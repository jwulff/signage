/**
 * Widget Dispatcher Lambda Handler
 * Runs widget updates on a schedule, but only if active connections exist.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { ScheduledEvent } from "aws-lambda";
import { hasActiveConnections } from "./connections";
import { broadcastWidgetUpdate } from "./broadcast";
import { getWidget } from "./registry";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

/**
 * Scheduled event handler for widget updates.
 * The widgetId is extracted from the EventBridge rule or Lambda function name.
 */
export const handler = async (event: ScheduledEvent): Promise<void> => {
  // Try to extract widget ID from EventBridge rule name first
  const ruleName = event.resources?.[0]?.split("/").pop() || "";
  let widgetId = extractWidgetId(ruleName);

  // Fallback: extract from Lambda function name (e.g., "signage-prod-BloodsugarWidgetHandlerFunction-xxx")
  if (!widgetId) {
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || "";
    widgetId = extractWidgetIdFromFunctionName(functionName);
  }

  if (!widgetId) {
    console.error("Could not determine widget ID from event or function name:", JSON.stringify(event));
    return;
  }

  console.log(`Widget dispatcher triggered for: ${widgetId}`);

  // Check if any connections exist
  const hasConnections = await hasActiveConnections();
  if (!hasConnections) {
    console.log(`No active connections, skipping update for widget: ${widgetId}`);
    return;
  }

  // Get the widget updater
  const widget = getWidget(widgetId);
  if (!widget) {
    console.error(`Unknown widget: ${widgetId}`);
    return;
  }

  try {
    // Run the widget update
    console.log(`Running update for widget: ${widget.name}`);
    const data = await widget.update();

    // Broadcast to all connections
    // managementEndpoint is already a complete URL including https://
    const apiEndpoint = Resource.SignageApi.managementEndpoint;
    const { sent, failed } = await broadcastWidgetUpdate(widgetId, data, apiEndpoint);
    console.log(`Broadcast complete: ${sent} sent, ${failed} failed`);

    // Update widget state
    await updateWidgetState(widgetId, data, null);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Widget update failed for ${widgetId}:`, errorMessage);
    await updateWidgetState(widgetId, null, errorMessage);
  }
};

/**
 * Extract widget ID from cron rule name.
 * Maps "ClockWidget" -> "clock", "WeatherWidget" -> "weather", etc.
 */
function extractWidgetId(ruleName: string): string | null {
  // Remove "Widget" suffix and lowercase
  const match = ruleName.match(/^(\w+)Widget$/);
  if (match) {
    return match[1].toLowerCase();
  }
  return null;
}

/**
 * Extract widget ID from Lambda function name.
 * Maps "signage-prod-BloodsugarWidgetHandlerFunction-xxx" -> "bloodsugar"
 */
function extractWidgetIdFromFunctionName(functionName: string): string | null {
  // Pattern: {app}-{stage}-{WidgetName}WidgetHandlerFunction-{hash}
  const match = functionName.match(/(\w+)WidgetHandlerFunction/i);
  if (match) {
    return match[1].toLowerCase();
  }
  return null;
}

/**
 * Update widget state in DynamoDB.
 */
async function updateWidgetState(
  widgetId: string,
  data: unknown,
  error: string | null
): Promise<void> {
  const now = new Date().toISOString();

  if (error) {
    // Increment error count
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.SignageTable.name,
        Key: { pk: `WIDGET#${widgetId}`, sk: "STATE" },
        UpdateExpression:
          "SET widgetId = :wid, lastRun = :now, lastError = :err, errorCount = if_not_exists(errorCount, :zero) + :one",
        ExpressionAttributeValues: {
          ":wid": widgetId,
          ":now": now,
          ":err": error,
          ":zero": 0,
          ":one": 1,
        },
      })
    );
  } else {
    // Success - reset error count, store data
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.SignageTable.name,
        Key: { pk: `WIDGET#${widgetId}`, sk: "STATE" },
        UpdateExpression:
          "SET widgetId = :wid, lastRun = :now, lastData = :data, errorCount = :zero REMOVE lastError",
        ExpressionAttributeValues: {
          ":wid": widgetId,
          ":now": now,
          ":data": data,
          ":zero": 0,
        },
      })
    );
  }
}
