/**
 * Pixoo health heartbeat — reports per-frame success/failure to glucagent's
 * DynamoDB so glucagent's monitor Lambda can decide whether to email the
 * owner. See jwulff/glucagent#130 for the schema and decision logic.
 *
 * Writes are best-effort: any error is logged but never thrown, so the relay
 * keeps trying to push frames even when the heartbeat path is broken
 * (credentials missing, table renamed, transient DDB outage).
 */

import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

export interface HealthHeartbeat {
  reportSuccess(): Promise<void>;
  reportFailure(reason: string): Promise<void>;
}

export interface HeartbeatOptions {
  deviceId: string;
  tableName: string;
  region: string;
}

export const noopHeartbeat: HealthHeartbeat = {
  async reportSuccess() {},
  async reportFailure() {},
};

export function createHeartbeat(opts: HeartbeatOptions): HealthHeartbeat {
  const client = new DynamoDBClient({ region: opts.region });
  const key = {
    pk: { S: `DEVICE_HEALTH#${opts.deviceId}` },
    sk: { S: "STATE" },
  };

  return {
    async reportSuccess() {
      const now = new Date().toISOString();
      try {
        await client.send(
          new UpdateItemCommand({
            TableName: opts.tableName,
            Key: key,
            UpdateExpression:
              "SET deviceId = :deviceId, lastSuccessAt = :now, consecutiveFailures = :zero",
            ExpressionAttributeValues: {
              ":deviceId": { S: opts.deviceId },
              ":now": { S: now },
              ":zero": { N: "0" },
            },
          }),
        );
      } catch (err) {
        console.error(
          "[heartbeat] reportSuccess failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    },

    async reportFailure(reason: string) {
      const now = new Date().toISOString();
      const safeReason = reason && reason.length > 0 ? reason : "unknown";
      try {
        await client.send(
          new UpdateItemCommand({
            TableName: opts.tableName,
            Key: key,
            UpdateExpression:
              "SET deviceId = :deviceId, lastFailureAt = :now, lastFailureReason = :reason " +
              "ADD consecutiveFailures :one",
            ExpressionAttributeValues: {
              ":deviceId": { S: opts.deviceId },
              ":now": { S: now },
              ":reason": { S: safeReason },
              ":one": { N: "1" },
            },
          }),
        );
      } catch (err) {
        console.error(
          "[heartbeat] reportFailure failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  };
}
