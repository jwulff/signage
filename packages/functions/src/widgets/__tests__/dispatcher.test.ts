import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDdbSend, mockHasActiveConnections, mockBroadcast, mockGetWidget } =
  vi.hoisted(() => ({
    mockDdbSend: vi.fn(),
    mockHasActiveConnections: vi.fn(),
    mockBroadcast: vi.fn(),
    mockGetWidget: vi.fn(),
  }));

vi.mock("sst", () => ({
  Resource: {
    SignageTable: { name: "test-table" },
    SignageApi: { managementEndpoint: "https://api.example.com" },
  },
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockDdbSend })),
  },
  UpdateCommand: vi.fn((params) => ({ type: "Update", params })),
}));

vi.mock("../connections", () => ({
  hasActiveConnections: mockHasActiveConnections,
}));

vi.mock("../broadcast", () => ({
  broadcastWidgetUpdate: mockBroadcast,
}));

vi.mock("../registry", () => ({
  getWidget: mockGetWidget,
}));

vi.mock("../history-store", () => ({
  needsBackfill: vi.fn().mockResolvedValue({ needed: false, gapMinutes: 0 }),
  storeDataPoints: vi.fn().mockResolvedValue({ stored: 0, batches: 0 }),
  storeDataPoint: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from "../dispatcher";
import type { ScheduledEvent } from "aws-lambda";

describe("dispatcher handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDdbSend.mockResolvedValue({});
    mockHasActiveConnections.mockResolvedValue(true);
    mockBroadcast.mockResolvedValue({ sent: 1, failed: 0 });
  });

  const createEvent = (ruleName: string): ScheduledEvent =>
    ({
      version: "0",
      id: "test-event",
      "detail-type": "Scheduled Event",
      source: "aws.events",
      account: "123456789012",
      time: "2024-01-01T00:00:00Z",
      region: "us-east-1",
      resources: [`arn:aws:events:us-east-1:123456789012:rule/${ruleName}`],
      detail: {},
    }) as ScheduledEvent;

  describe("widget ID extraction", () => {
    it("extracts widget ID from rule name", async () => {
      const mockWidget = {
        name: "clock",
        update: vi.fn().mockResolvedValue({ time: "12:00" }),
      };
      mockGetWidget.mockReturnValue(mockWidget);

      await handler(createEvent("ClockWidget"));

      expect(mockGetWidget).toHaveBeenCalledWith("clock");
    });

    it("extracts widget ID from function name as fallback", async () => {
      const originalEnv = process.env.AWS_LAMBDA_FUNCTION_NAME;
      process.env.AWS_LAMBDA_FUNCTION_NAME =
        "signage-prod-BloodsugarWidgetHandlerFunction-xxx";

      const mockWidget = {
        name: "bloodsugar",
        update: vi.fn().mockResolvedValue({ value: 120 }),
      };
      mockGetWidget.mockReturnValue(mockWidget);

      // Event with no valid rule name
      const event = createEvent("SomeOtherRule");

      await handler(event);

      expect(mockGetWidget).toHaveBeenCalledWith("bloodsugar");

      process.env.AWS_LAMBDA_FUNCTION_NAME = originalEnv;
    });

    it("returns early if widget ID cannot be determined", async () => {
      const originalEnv = process.env.AWS_LAMBDA_FUNCTION_NAME;
      process.env.AWS_LAMBDA_FUNCTION_NAME = "";

      const event = createEvent("InvalidRule");

      await handler(event);

      expect(mockGetWidget).not.toHaveBeenCalled();

      process.env.AWS_LAMBDA_FUNCTION_NAME = originalEnv;
    });
  });

  describe("connection check", () => {
    it("skips update when no active connections", async () => {
      mockHasActiveConnections.mockResolvedValue(false);
      mockGetWidget.mockReturnValue({ name: "clock", update: vi.fn() });

      await handler(createEvent("ClockWidget"));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it("proceeds with update when connections exist", async () => {
      mockHasActiveConnections.mockResolvedValue(true);
      const mockWidget = {
        name: "clock",
        update: vi.fn().mockResolvedValue({ time: "12:00" }),
      };
      mockGetWidget.mockReturnValue(mockWidget);

      await handler(createEvent("ClockWidget"));

      expect(mockWidget.update).toHaveBeenCalled();
      expect(mockBroadcast).toHaveBeenCalled();
    });
  });

  describe("widget lookup", () => {
    it("returns early for unknown widget", async () => {
      mockGetWidget.mockReturnValue(null);

      await handler(createEvent("ClockWidget"));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });
  });

  describe("widget update", () => {
    it("calls widget update and broadcasts result", async () => {
      const mockWidget = {
        name: "clock",
        update: vi.fn().mockResolvedValue({ time: "12:00" }),
      };
      mockGetWidget.mockReturnValue(mockWidget);

      await handler(createEvent("ClockWidget"));

      expect(mockWidget.update).toHaveBeenCalled();
      expect(mockBroadcast).toHaveBeenCalledWith(
        "clock",
        { time: "12:00" },
        "https://api.example.com"
      );
    });

    it("updates widget state on success", async () => {
      const mockWidget = {
        name: "clock",
        update: vi.fn().mockResolvedValue({ time: "12:00" }),
      };
      mockGetWidget.mockReturnValue(mockWidget);

      await handler(createEvent("ClockWidget"));

      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Update",
          params: expect.objectContaining({
            Key: { pk: "WIDGET#clock", sk: "STATE" },
          }),
        })
      );
    });

    it("updates widget state with error on failure", async () => {
      const mockWidget = {
        name: "clock",
        update: vi.fn().mockRejectedValue(new Error("API failed")),
      };
      mockGetWidget.mockReturnValue(mockWidget);

      await handler(createEvent("ClockWidget"));

      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Update",
          params: expect.objectContaining({
            Key: { pk: "WIDGET#clock", sk: "STATE" },
            UpdateExpression: expect.stringContaining("lastError"),
          }),
        })
      );
    });
  });
});
