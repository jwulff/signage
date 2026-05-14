import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { createHeartbeat, noopHeartbeat } from "./heartbeat.js";

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-13T07:20:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("noopHeartbeat", () => {
  it("does nothing on success and failure (no throw)", async () => {
    await expect(noopHeartbeat.reportSuccess()).resolves.toBeUndefined();
    await expect(noopHeartbeat.reportFailure("err")).resolves.toBeUndefined();
  });
});

describe("createHeartbeat — reportSuccess", () => {
  it("updates the device record with lastSuccessAt and resets the failure counter", async () => {
    ddbMock.on(UpdateItemCommand).resolves({});
    const hb = createHeartbeat({
      deviceId: "pixoo-home",
      tableName: "glucagent-production-RecordsTable-smvstaex",
      region: "us-east-1",
    });

    await hb.reportSuccess();

    const calls = ddbMock.commandCalls(UpdateItemCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.TableName).toBe("glucagent-production-RecordsTable-smvstaex");
    expect(input.Key).toEqual({
      pk: { S: "DEVICE_HEALTH#pixoo-home" },
      sk: { S: "STATE" },
    });
    expect(input.UpdateExpression).toContain("lastSuccessAt");
    expect(input.UpdateExpression).toContain("consecutiveFailures");
    expect(input.UpdateExpression).toContain("deviceId");
    expect(input.ExpressionAttributeValues?.[":now"]?.S).toBe("2026-05-13T07:20:00.000Z");
    expect(input.ExpressionAttributeValues?.[":zero"]?.N).toBe("0");
    expect(input.ExpressionAttributeValues?.[":deviceId"]?.S).toBe("pixoo-home");
  });
});

describe("createHeartbeat — reportFailure", () => {
  it("updates lastFailureAt, increments consecutiveFailures, records reason", async () => {
    ddbMock.on(UpdateItemCommand).resolves({});
    const hb = createHeartbeat({
      deviceId: "pixoo-home",
      tableName: "test-table",
      region: "us-east-1",
    });

    await hb.reportFailure("UND_ERR_CONNECT_TIMEOUT");

    const calls = ddbMock.commandCalls(UpdateItemCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.UpdateExpression).toContain("lastFailureAt");
    expect(input.UpdateExpression).toContain("consecutiveFailures");
    expect(input.UpdateExpression).toContain("lastFailureReason");
    expect(input.ExpressionAttributeValues?.[":reason"]?.S).toBe("UND_ERR_CONNECT_TIMEOUT");
    expect(input.ExpressionAttributeValues?.[":one"]?.N).toBe("1");
  });

  it("uses 'unknown' when reason is empty", async () => {
    ddbMock.on(UpdateItemCommand).resolves({});
    const hb = createHeartbeat({
      deviceId: "pixoo-home",
      tableName: "test-table",
      region: "us-east-1",
    });

    await hb.reportFailure("");

    const input = ddbMock.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues?.[":reason"]?.S).toBe("unknown");
  });
});

describe("createHeartbeat — best-effort error handling", () => {
  it("does not throw when DynamoDB rejects on success path", async () => {
    ddbMock.on(UpdateItemCommand).rejects(new Error("AccessDenied"));
    const hb = createHeartbeat({
      deviceId: "pixoo-home",
      tableName: "test-table",
      region: "us-east-1",
    });
    await expect(hb.reportSuccess()).resolves.toBeUndefined();
  });

  it("does not throw when DynamoDB rejects on failure path", async () => {
    ddbMock.on(UpdateItemCommand).rejects(new Error("ResourceNotFound"));
    const hb = createHeartbeat({
      deviceId: "pixoo-home",
      tableName: "test-table",
      region: "us-east-1",
    });
    await expect(hb.reportFailure("X")).resolves.toBeUndefined();
  });
});
