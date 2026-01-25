import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock functions using vi.hoisted to ensure they're available during mock hoisting
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

// Mock SST Resource before importing handler
vi.mock("sst", () => ({
  Resource: {
    SignageTable: { name: "test-table" },
  },
}));

// Mock DynamoDB
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockSend })),
  },
  DeleteCommand: vi.fn((params) => ({ type: "Delete", params })),
  UpdateCommand: vi.fn((params) => ({ type: "Update", params })),
}));

import { handler } from "../disconnect";
import type { APIGatewayProxyWebsocketEventV2 } from "aws-lambda";

describe("disconnect handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  const createEvent = (
    connectionId: string
  ): APIGatewayProxyWebsocketEventV2 =>
    ({
      requestContext: {
        connectionId,
        routeKey: "$disconnect",
        eventType: "DISCONNECT",
        domainName: "test.execute-api.us-east-1.amazonaws.com",
        stage: "dev",
      },
      isBase64Encoded: false,
    }) as unknown as APIGatewayProxyWebsocketEventV2;

  it("returns 200 on successful disconnection", async () => {
    const event = createEvent("conn-123");
    const result = await handler(event, {} as never, () => {});

    expect(result).toEqual({
      statusCode: 200,
      body: "Disconnected",
    });
  });

  it("removes connection from DynamoDB", async () => {
    const event = createEvent("conn-456");

    await handler(event, {} as never, () => {});

    expect(mockSend).toHaveBeenCalledTimes(2);

    // First call: DeleteCommand for connection
    const deleteCall = mockSend.mock.calls[0][0];
    expect(deleteCall.type).toBe("Delete");
    expect(deleteCall.params.TableName).toBe("test-table");
    expect(deleteCall.params.Key.pk).toBe("CONNECTIONS");
    expect(deleteCall.params.Key.sk).toBe("conn-456");
  });

  it("decrements connection counter", async () => {
    const event = createEvent("conn-789");

    await handler(event, {} as never, () => {});

    // Second call: UpdateCommand for counter
    const updateCall = mockSend.mock.calls[1][0];
    expect(updateCall.type).toBe("Update");
    expect(updateCall.params.Key.pk).toBe("CONNECTION_COUNT#GLOBAL");
    expect(updateCall.params.Key.sk).toBe("COUNTER");
    expect(updateCall.params.UpdateExpression).toContain("- :dec");
  });

  it("handles ConditionalCheckFailedException gracefully", async () => {
    const conditionalError = new Error("Conditional check failed");
    (conditionalError as Error & { name: string }).name =
      "ConditionalCheckFailedException";

    mockSend
      .mockResolvedValueOnce({}) // Delete succeeds
      .mockRejectedValueOnce(conditionalError); // Update fails with condition

    const event = createEvent("conn-zero-counter");
    const result = await handler(event, {} as never, () => {});

    // Should not throw, should return success
    expect(result).toEqual({
      statusCode: 200,
      body: "Disconnected",
    });
  });

  it("rethrows non-conditional errors", async () => {
    const otherError = new Error("DynamoDB error");
    (otherError as Error & { name: string }).name = "ServiceException";

    mockSend
      .mockResolvedValueOnce({}) // Delete succeeds
      .mockRejectedValueOnce(otherError); // Update fails with other error

    const event = createEvent("conn-error");

    await expect(handler(event, {} as never, () => {})).rejects.toThrow(
      "DynamoDB error"
    );
  });
});
