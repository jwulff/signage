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
import type { WidgetUpdaterWithHistory, TimeSeriesPoint } from "./types";
import { needsBackfill, storeDataPoints, storeDataPoint } from "./history-store";

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
    // Check if this widget supports history and needs backfill
    const historyWidget = widget as WidgetUpdaterWithHistory;
    if (historyWidget.historyConfig?.enabled && historyWidget.fetchHistory) {
      await handleBackfillIfNeeded(widgetId, historyWidget);
    }

    // Run the widget update
    console.log(`Running update for widget: ${widget.name}`);
    const data = await widget.update();

    // Store data point if history is enabled
    if (historyWidget.historyConfig?.enabled && data && typeof data === "object") {
      await storeCurrentDataPoint(widgetId, data, historyWidget);
    }

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

/**
 * Check if backfill is needed and perform it.
 */
async function handleBackfillIfNeeded(
  widgetId: string,
  widget: WidgetUpdaterWithHistory
): Promise<void> {
  if (!widget.historyConfig || !widget.fetchHistory) {
    return;
  }

  const backfillStatus = await needsBackfill(widgetId, widget.historyConfig);

  if (!backfillStatus.needed || backfillStatus.since === undefined) {
    console.log(
      `No backfill needed for ${widgetId}, gap=${backfillStatus.gapMinutes.toFixed(1)} minutes`
    );
    return;
  }

  console.log(
    `Backfill needed for ${widgetId}, gap=${backfillStatus.gapMinutes.toFixed(1)} minutes`
  );

  try {
    const now = Date.now();
    const points = await widget.fetchHistory(backfillStatus.since, now);

    if (points.length > 0) {
      const result = await storeDataPoints(widgetId, points, widget.historyConfig);
      console.log(
        `Backfill complete for ${widgetId}: stored ${result.stored} points in ${result.batches} batches`
      );
    } else {
      console.log(`Backfill for ${widgetId}: no points returned`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Backfill failed for ${widgetId}:`, errorMessage);
    // Don't throw - allow normal update to proceed
  }
}

/**
 * Store the current update data as a history point.
 */
async function storeCurrentDataPoint(
  widgetId: string,
  data: unknown,
  widget: WidgetUpdaterWithHistory
): Promise<void> {
  if (!widget.historyConfig) {
    return;
  }

  // Extract timestamp from data if it has one, otherwise use now
  const dataObj = data as Record<string, unknown>;
  const timestamp =
    typeof dataObj.timestamp === "number" ? dataObj.timestamp : Date.now();

  // Build the point - extract core values and metadata
  const point: TimeSeriesPoint = {
    timestamp,
    value: extractValueFields(dataObj),
    meta: extractMetaFields(dataObj),
  };

  try {
    await storeDataPoint(widgetId, point, widget.historyConfig);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to store data point for ${widgetId}:`, errorMessage);
    // Don't throw - this is non-critical
  }
}

/**
 * Extract value fields from data (exclude metadata-like fields).
 */
function extractValueFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const metaKeys = ["trend", "trendArrow", "delta", "isStale", "timestamp"];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!metaKeys.includes(key)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract metadata fields from data.
 */
function extractMetaFields(
  data: Record<string, unknown>
): Record<string, unknown> | undefined {
  const metaKeys = ["trend", "trendArrow", "delta"];
  const result: Record<string, unknown> = {};

  for (const key of metaKeys) {
    if (key in data) {
      result[key] = data[key];
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
