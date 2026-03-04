import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLightsailSend, mockDdbSend } = vi.hoisted(() => ({
  mockLightsailSend: vi.fn(),
  mockDdbSend: vi.fn(),
}));

vi.mock("sst", () => ({
  Resource: {
    SignageTable: { name: "test-table" },
  },
}));

vi.mock("@aws-sdk/client-lightsail", () => ({
  LightsailClient: vi.fn(() => ({ send: mockLightsailSend })),
  GetInstanceMetricDataCommand: vi.fn((params) => ({
    type: "GetInstanceMetricData",
    params,
  })),
  RebootInstanceCommand: vi.fn((params) => ({
    type: "RebootInstance",
    params,
  })),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockDdbSend })),
  },
  GetCommand: vi.fn((params) => ({ type: "Get", params })),
  PutCommand: vi.fn((params) => ({ type: "Put", params })),
}));

import { handler } from "./health-check.js";

describe("lightsail health-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when instance is healthy", async () => {
    mockLightsailSend.mockResolvedValueOnce({
      metricData: [{ maximum: 0 }],
    });

    await handler();

    expect(mockLightsailSend).toHaveBeenCalledTimes(1);
    expect(mockLightsailSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GetInstanceMetricData" })
    );
    // Should not check debounce or reboot
    expect(mockDdbSend).not.toHaveBeenCalled();
  });

  it("reboots when status checks are failing", async () => {
    // Metric shows failure
    mockLightsailSend.mockResolvedValueOnce({
      metricData: [{ maximum: 1.0 }],
    });
    // Reboot succeeds
    mockLightsailSend.mockResolvedValueOnce({});

    // No recent reboot in DynamoDB
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });
    // Put reboot time succeeds
    mockDdbSend.mockResolvedValueOnce({});

    await handler();

    // Should have called: GetMetricData + RebootInstance
    expect(mockLightsailSend).toHaveBeenCalledTimes(2);
    expect(mockLightsailSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RebootInstance" })
    );

    // Should have called: Get debounce + Put reboot time
    expect(mockDdbSend).toHaveBeenCalledTimes(2);
    expect(mockDdbSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Put",
        params: expect.objectContaining({
          TableName: "test-table",
          Item: expect.objectContaining({
            pk: "LIGHTSAIL_HEALTH",
            sk: "LAST_REBOOT",
          }),
        }),
      })
    );
  });

  it("skips reboot when recently rebooted (debounce)", async () => {
    // Metric shows failure
    mockLightsailSend.mockResolvedValueOnce({
      metricData: [{ maximum: 1.0 }],
    });

    // Recent reboot — 30 minutes ago
    mockDdbSend.mockResolvedValueOnce({
      Item: { rebootedAt: Date.now() - 30 * 60 * 1000 },
    });

    await handler();

    // Should have checked metrics but NOT rebooted
    expect(mockLightsailSend).toHaveBeenCalledTimes(1);
    expect(mockDdbSend).toHaveBeenCalledTimes(1);
  });

  it("allows reboot when last reboot was over 1 hour ago", async () => {
    // Metric shows failure
    mockLightsailSend.mockResolvedValueOnce({
      metricData: [{ maximum: 1.0 }],
    });
    // Reboot succeeds
    mockLightsailSend.mockResolvedValueOnce({});

    // Last reboot was 2 hours ago
    mockDdbSend.mockResolvedValueOnce({
      Item: { rebootedAt: Date.now() - 2 * 60 * 60 * 1000 },
    });
    // Put reboot time succeeds
    mockDdbSend.mockResolvedValueOnce({});

    await handler();

    expect(mockLightsailSend).toHaveBeenCalledTimes(2);
    expect(mockLightsailSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RebootInstance" })
    );
  });

  it("handles Lightsail API error gracefully", async () => {
    mockLightsailSend.mockRejectedValueOnce(new Error("API error"));

    await handler();

    // Should not crash, and should not attempt reboot
    expect(mockLightsailSend).toHaveBeenCalledTimes(1);
    expect(mockDdbSend).not.toHaveBeenCalled();
  });

  it("handles empty metric data as healthy", async () => {
    mockLightsailSend.mockResolvedValueOnce({
      metricData: [],
    });

    await handler();

    expect(mockLightsailSend).toHaveBeenCalledTimes(1);
    expect(mockDdbSend).not.toHaveBeenCalled();
  });

  it("handles undefined metricData as healthy", async () => {
    mockLightsailSend.mockResolvedValueOnce({});

    await handler();

    expect(mockLightsailSend).toHaveBeenCalledTimes(1);
    expect(mockDdbSend).not.toHaveBeenCalled();
  });

  it("proceeds with reboot if debounce check fails", async () => {
    // Metric shows failure
    mockLightsailSend.mockResolvedValueOnce({
      metricData: [{ maximum: 1.0 }],
    });
    // Reboot succeeds
    mockLightsailSend.mockResolvedValueOnce({});

    // Debounce check fails
    mockDdbSend.mockRejectedValueOnce(new Error("DynamoDB error"));
    // Put reboot time succeeds
    mockDdbSend.mockResolvedValueOnce({});

    await handler();

    // Should still reboot despite debounce check failure
    expect(mockLightsailSend).toHaveBeenCalledTimes(2);
    expect(mockLightsailSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RebootInstance" })
    );
  });
});
