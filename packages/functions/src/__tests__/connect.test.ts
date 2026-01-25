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
  PutCommand: vi.fn((params) => ({ type: "Put", params })),
  UpdateCommand: vi.fn((params) => ({ type: "Update", params })),
}));

import { handler } from "../connect";
import type { APIGatewayProxyWebsocketEventV2 } from "aws-lambda";

describe("connect handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  const createEvent = (
    connectionId: string,
    queryParams?: Record<string, string>
  ): APIGatewayProxyWebsocketEventV2 =>
    ({
      requestContext: {
        connectionId,
        routeKey: "$connect",
        eventType: "CONNECT",
        domainName: "test.execute-api.us-east-1.amazonaws.com",
        stage: "dev",
      },
      queryStringParameters: queryParams,
      isBase64Encoded: false,
    }) as unknown as APIGatewayProxyWebsocketEventV2;

  it("returns 200 on successful connection", async () => {
    const event = createEvent("conn-123");
    const result = await handler(event, {} as never, () => {});

    expect(result).toEqual({
      statusCode: 200,
      body: "Connected",
    });
  });

  it("stores connection in DynamoDB", async () => {
    const event = createEvent("conn-456", {
      terminalId: "terminal-1",
      type: "pixoo",
    });

    await handler(event, {} as never, () => {});

    expect(mockSend).toHaveBeenCalledTimes(2);

    // First call: PutCommand for connection
    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.type).toBe("Put");
    expect(putCall.params.TableName).toBe("test-table");
    expect(putCall.params.Item.pk).toBe("CONNECTIONS");
    expect(putCall.params.Item.sk).toBe("conn-456");
    expect(putCall.params.Item.connectionId).toBe("conn-456");
    expect(putCall.params.Item.terminalId).toBe("terminal-1");
    expect(putCall.params.Item.terminalType).toBe("pixoo");
  });

  it("increments connection counter", async () => {
    const event = createEvent("conn-789");

    await handler(event, {} as never, () => {});

    // Second call: UpdateCommand for counter
    const updateCall = mockSend.mock.calls[1][0];
    expect(updateCall.type).toBe("Update");
    expect(updateCall.params.Key.pk).toBe("CONNECTION_COUNT#GLOBAL");
    expect(updateCall.params.Key.sk).toBe("COUNTER");
    expect(updateCall.params.UpdateExpression).toContain("ADD");
  });

  it("handles missing terminalId", async () => {
    const event = createEvent("conn-no-terminal");

    await handler(event, {} as never, () => {});

    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.params.Item.terminalId).toBeNull();
  });

  it("defaults terminal type to unknown", async () => {
    const event = createEvent("conn-no-type", { terminalId: "t1" });

    await handler(event, {} as never, () => {});

    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.params.Item.terminalType).toBe("unknown");
  });
});
