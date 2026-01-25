import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock functions using vi.hoisted to ensure they're available during mock hoisting
const { mockDdbSend, mockApiSend } = vi.hoisted(() => ({
  mockDdbSend: vi.fn(),
  mockApiSend: vi.fn(),
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
    from: vi.fn(() => ({ send: mockDdbSend })),
  },
  QueryCommand: vi.fn((params) => ({ type: "Query", params })),
  GetCommand: vi.fn((params) => ({ type: "Get", params })),
}));

// Mock API Gateway Management API
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: vi.fn(() => ({ send: mockApiSend })),
  PostToConnectionCommand: vi.fn((params) => ({ type: "Post", params })),
}));

import { handler } from "../message";
import type { APIGatewayProxyWebsocketEventV2 } from "aws-lambda";

describe("message handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDdbSend.mockResolvedValue({ Items: [] });
    mockApiSend.mockResolvedValue({});
  });

  const createEvent = (
    connectionId: string,
    body: string | null
  ): APIGatewayProxyWebsocketEventV2 =>
    ({
      requestContext: {
        connectionId,
        routeKey: "$default",
        eventType: "MESSAGE",
        domainName: "test.execute-api.us-east-1.amazonaws.com",
        stage: "dev",
      },
      body,
      isBase64Encoded: false,
    }) as unknown as APIGatewayProxyWebsocketEventV2;

  describe("validation", () => {
    it("returns 400 for empty message body", async () => {
      const event = createEvent("conn-123", null);
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 400,
        body: "Empty message",
      });
    });

    it("returns 400 for invalid JSON", async () => {
      const event = createEvent("conn-123", "not valid json");
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 400,
        body: "Invalid JSON",
      });
    });
  });

  describe("connect message type", () => {
    it("sends cached frame to client on connect", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          width: 64,
          height: 64,
          frameData: "base64-frame-data",
        },
      });

      const event = createEvent(
        "conn-123",
        JSON.stringify({ type: "connect", payload: {}, timestamp: Date.now() })
      );
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 200,
        body: "Registered",
      });

      // Should fetch cached frame
      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: "Get" })
      );

      // Should send frame to client
      expect(mockApiSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Post",
          params: expect.objectContaining({
            ConnectionId: "conn-123",
          }),
        })
      );
    });

    it("handles missing cached frame gracefully", async () => {
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });

      const event = createEvent(
        "conn-123",
        JSON.stringify({ type: "connect", payload: {}, timestamp: Date.now() })
      );
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 200,
        body: "Registered",
      });
      expect(mockApiSend).not.toHaveBeenCalled();
    });

    it("handles cache fetch error gracefully", async () => {
      mockDdbSend.mockRejectedValueOnce(new Error("DynamoDB error"));

      const event = createEvent(
        "conn-123",
        JSON.stringify({ type: "connect", payload: {}, timestamp: Date.now() })
      );
      const result = await handler(event, {} as never, () => {});

      // Should still return success
      expect(result).toEqual({
        statusCode: 200,
        body: "Registered",
      });
    });
  });

  describe("ping message type", () => {
    it("responds with pong", async () => {
      const event = createEvent(
        "conn-123",
        JSON.stringify({ type: "ping", payload: {}, timestamp: Date.now() })
      );
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 200,
        body: "pong",
      });

      expect(mockApiSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Post",
          params: expect.objectContaining({
            ConnectionId: "conn-123",
          }),
        })
      );

      // Verify pong message content
      const postCall = mockApiSend.mock.calls[0][0];
      const data = JSON.parse(postCall.params.Data);
      expect(data.type).toBe("pong");
    });
  });

  describe("broadcast message type", () => {
    it("broadcasts to all connections", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          { connectionId: "conn-1" },
          { connectionId: "conn-2" },
          { connectionId: "conn-3" },
        ],
      });

      const event = createEvent(
        "conn-sender",
        JSON.stringify({
          type: "broadcast",
          payload: { frame: { data: "test" } },
          timestamp: Date.now(),
        })
      );
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 200,
        body: "Broadcast sent",
      });

      // Should query for all connections
      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: "Query" })
      );

      // Should send to all 3 connections
      expect(mockApiSend).toHaveBeenCalledTimes(3);
    });

    it("handles stale connections gracefully", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [{ connectionId: "conn-1" }, { connectionId: "conn-stale" }],
      });

      mockApiSend
        .mockResolvedValueOnce({}) // conn-1 succeeds
        .mockRejectedValueOnce(new Error("Gone")); // conn-stale fails

      const event = createEvent(
        "conn-sender",
        JSON.stringify({
          type: "broadcast",
          payload: {},
          timestamp: Date.now(),
        })
      );
      const result = await handler(event, {} as never, () => {});

      // Should still return success
      expect(result).toEqual({
        statusCode: 200,
        body: "Broadcast sent",
      });
    });

    it("handles empty connection list", async () => {
      mockDdbSend.mockResolvedValueOnce({ Items: [] });

      const event = createEvent(
        "conn-sender",
        JSON.stringify({
          type: "broadcast",
          payload: {},
          timestamp: Date.now(),
        })
      );
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 200,
        body: "Broadcast sent",
      });
      expect(mockApiSend).not.toHaveBeenCalled();
    });
  });

  describe("unknown message type", () => {
    it("returns OK for unknown message types", async () => {
      const event = createEvent(
        "conn-123",
        JSON.stringify({
          type: "unknown-type",
          payload: {},
          timestamp: Date.now(),
        })
      );
      const result = await handler(event, {} as never, () => {});

      expect(result).toEqual({
        statusCode: 200,
        body: "OK",
      });
    });
  });
});
