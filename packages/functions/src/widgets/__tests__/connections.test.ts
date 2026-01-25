import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

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
    from: vi.fn(() => ({ send: mockSend })),
  },
  GetCommand: vi.fn((params) => ({ type: "Get", params })),
}));

import { getConnectionCount, hasActiveConnections } from "../connections";

describe("connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getConnectionCount", () => {
    it("returns count from DynamoDB", async () => {
      mockSend.mockResolvedValueOnce({
        Item: { count: 5 },
      });

      const count = await getConnectionCount();

      expect(count).toBe(5);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Get",
          params: expect.objectContaining({
            Key: { pk: "CONNECTION_COUNT#GLOBAL", sk: "COUNTER" },
          }),
        })
      );
    });

    it("returns 0 when item does not exist", async () => {
      mockSend.mockResolvedValueOnce({
        Item: undefined,
      });

      const count = await getConnectionCount();

      expect(count).toBe(0);
    });

    it("returns 0 when count is not set", async () => {
      mockSend.mockResolvedValueOnce({
        Item: {},
      });

      const count = await getConnectionCount();

      expect(count).toBe(0);
    });
  });

  describe("hasActiveConnections", () => {
    it("returns true when count is greater than 0", async () => {
      mockSend.mockResolvedValueOnce({
        Item: { count: 3 },
      });

      const hasConnections = await hasActiveConnections();

      expect(hasConnections).toBe(true);
    });

    it("returns false when count is 0", async () => {
      mockSend.mockResolvedValueOnce({
        Item: { count: 0 },
      });

      const hasConnections = await hasActiveConnections();

      expect(hasConnections).toBe(false);
    });

    it("returns false when item does not exist", async () => {
      mockSend.mockResolvedValueOnce({
        Item: undefined,
      });

      const hasConnections = await hasActiveConnections();

      expect(hasConnections).toBe(false);
    });
  });
});
