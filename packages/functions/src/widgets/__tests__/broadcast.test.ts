import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDdbSend, mockApiSend, MockGoneException } = vi.hoisted(() => {
  class GoneException extends Error {
    constructor() {
      super("Gone");
      this.name = "GoneException";
    }
  }
  return {
    mockDdbSend: vi.fn(),
    mockApiSend: vi.fn(),
    MockGoneException: GoneException,
  };
});

vi.mock("sst", () => ({
  Resource: {
    SignageTable: { name: "test-table" },
  },
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockDdbSend })),
  },
  QueryCommand: vi.fn((params) => ({ type: "Query", params })),
  DeleteCommand: vi.fn((params) => ({ type: "Delete", params })),
}));

vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: vi.fn(() => ({ send: mockApiSend })),
  PostToConnectionCommand: vi.fn((params) => ({ type: "Post", params })),
  GoneException: MockGoneException,
}));

import { broadcastWidgetUpdate } from "../broadcast";

describe("broadcastWidgetUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDdbSend.mockResolvedValue({ Items: [] });
    mockApiSend.mockResolvedValue({});
  });

  it("broadcasts to all connections", async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [
        { pk: "CONNECTIONS", sk: "conn-1", connectionId: "conn-1" },
        { pk: "CONNECTIONS", sk: "conn-2", connectionId: "conn-2" },
      ],
    });

    const result = await broadcastWidgetUpdate(
      "clock",
      { time: "12:00" },
      "https://api.example.com"
    );

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(mockApiSend).toHaveBeenCalledTimes(2);
  });

  it("queries connections from DynamoDB", async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    await broadcastWidgetUpdate("clock", { time: "12:00" }, "https://api.example.com");

    expect(mockDdbSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Query",
        params: expect.objectContaining({
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": "CONNECTIONS" },
        }),
      })
    );
  });

  it("sends correct message format", async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [{ pk: "CONNECTIONS", sk: "conn-1", connectionId: "conn-1" }],
    });

    await broadcastWidgetUpdate("blood-sugar", { value: 120 }, "https://api.example.com");

    expect(mockApiSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Post",
        params: expect.objectContaining({
          ConnectionId: "conn-1",
        }),
      })
    );

    const postCall = mockApiSend.mock.calls[0][0];
    const message = JSON.parse(postCall.params.Data);
    expect(message.type).toBe("widget-update");
    expect(message.widgetId).toBe("blood-sugar");
    expect(message.data).toEqual({ value: 120 });
    expect(message.timestamp).toBeDefined();
  });

  it("handles empty connection list", async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const result = await broadcastWidgetUpdate(
      "clock",
      { time: "12:00" },
      "https://api.example.com"
    );

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockApiSend).not.toHaveBeenCalled();
  });

  it("removes stale connections on GoneException", async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [{ pk: "CONNECTIONS", sk: "stale-conn", connectionId: "stale-conn" }],
    });
    mockApiSend.mockRejectedValueOnce(new MockGoneException());

    const result = await broadcastWidgetUpdate(
      "clock",
      { time: "12:00" },
      "https://api.example.com"
    );

    expect(result).toEqual({ sent: 0, failed: 1 });

    // Should delete the stale connection
    expect(mockDdbSend).toHaveBeenCalledTimes(2);
    expect(mockDdbSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "Delete",
        params: expect.objectContaining({
          Key: { pk: "CONNECTIONS", sk: "stale-conn" },
        }),
      })
    );
  });

  it("logs but does not delete on other errors", async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [{ pk: "CONNECTIONS", sk: "conn-1", connectionId: "conn-1" }],
    });
    mockApiSend.mockRejectedValueOnce(new Error("Network error"));

    const result = await broadcastWidgetUpdate(
      "clock",
      { time: "12:00" },
      "https://api.example.com"
    );

    expect(result).toEqual({ sent: 0, failed: 1 });
    // Should NOT delete the connection
    expect(mockDdbSend).toHaveBeenCalledTimes(1); // Only the Query, no Delete
  });

  it("handles mixed success and failure", async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [
        { pk: "CONNECTIONS", sk: "conn-1", connectionId: "conn-1" },
        { pk: "CONNECTIONS", sk: "conn-2", connectionId: "conn-2" },
        { pk: "CONNECTIONS", sk: "conn-3", connectionId: "conn-3" },
      ],
    });
    mockApiSend
      .mockResolvedValueOnce({}) // conn-1 success
      .mockRejectedValueOnce(new Error("Failed")) // conn-2 fails
      .mockResolvedValueOnce({}); // conn-3 success

    const result = await broadcastWidgetUpdate(
      "clock",
      { time: "12:00" },
      "https://api.example.com"
    );

    expect(result).toEqual({ sent: 2, failed: 1 });
  });
});
