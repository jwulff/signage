import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TimeSeriesPoint, WidgetHistoryConfig } from "./types";

// Create mockSend before vi.mock hoisting
const mockSend = vi.fn();

// Mock SST Resource
vi.mock("sst", () => ({
  Resource: {
    SignageTable: { name: "test-table" },
  },
}));

// Mock DynamoDB
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}));

// Mock DynamoDB DocumentClient - use factory that captures mockSend
vi.mock("@aws-sdk/lib-dynamodb", async () => {
  return {
    DynamoDBDocumentClient: {
      from: () => ({ send: mockSend }),
    },
    GetCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: "Get" })),
    PutCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: "Put" })),
    QueryCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: "Query" })),
    BatchWriteCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: "BatchWrite" })),
  };
});

// Import after mocks are set up
const {
  calculateTTL,
  storeDataPoint,
  storeDataPoints,
  queryHistory,
  getHistoryMeta,
  needsBackfill,
  isDuplicate,
} = await import("./history-store");

const TEST_CONFIG: WidgetHistoryConfig = {
  enabled: true,
  retentionHours: 24,
  backfillDepthHours: 24,
  backfillThresholdMinutes: 15,
  dedupeWindowMinutes: 5,
  storageType: "time-series",
};

describe("calculateTTL", () => {
  it("calculates TTL in epoch seconds", () => {
    const now = Date.now();
    const ttl = calculateTTL(24);

    // TTL should be ~24 hours in the future
    const expectedMin = Math.floor(now / 1000) + 23 * 3600; // Allow 1 hour variance
    const expectedMax = Math.floor(now / 1000) + 25 * 3600;

    expect(ttl).toBeGreaterThanOrEqual(expectedMin);
    expect(ttl).toBeLessThanOrEqual(expectedMax);
  });

  it("handles different retention periods", () => {
    const ttl1 = calculateTTL(1);
    const ttl12 = calculateTTL(12);
    const ttl48 = calculateTTL(48);

    // Each should be progressively further in the future
    expect(ttl12 - ttl1).toBeCloseTo(11 * 3600, -2);
    expect(ttl48 - ttl12).toBeCloseTo(36 * 3600, -2);
  });
});

describe("storeDataPoint", () => {
  beforeEach(() => {
    mockSend.mockReset();
    // Default mock: first call for Put, second for Get (meta), third for Put (meta update)
    mockSend
      .mockResolvedValueOnce({}) // PutCommand for data point
      .mockResolvedValueOnce({ Item: null }) // GetCommand for existing meta
      .mockResolvedValueOnce({}); // PutCommand for meta update
  });

  it("stores a data point with correct pk/sk format", async () => {
    const point: TimeSeriesPoint<{ glucose: number }> = {
      timestamp: 1737196200000,
      value: { glucose: 120 },
    };

    await storeDataPoint("bloodsugar", point, TEST_CONFIG);

    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.TableName).toBe("test-table");
    expect(putCall.Item.pk).toBe("WIDGET#bloodsugar#HISTORY");
    expect(putCall.Item.sk).toMatch(/^TS#\d{4}-\d{2}-\d{2}T/);
    expect(putCall.Item.timestamp).toBe(1737196200000);
    expect(putCall.Item.value).toEqual({ glucose: 120 });
    expect(putCall.Item.ttl).toBeDefined();
  });

  it("includes metadata when provided", async () => {
    const point: TimeSeriesPoint<{ glucose: number }> = {
      timestamp: 1737196200000,
      value: { glucose: 120 },
      meta: { trend: "Flat", trendArrow: "→" },
    };

    await storeDataPoint("bloodsugar", point, TEST_CONFIG);

    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.Item.meta).toEqual({ trend: "Flat", trendArrow: "→" });
  });
});

describe("storeDataPoints", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns early for empty array", async () => {
    const result = await storeDataPoints("bloodsugar", [], TEST_CONFIG);

    expect(result).toEqual({ stored: 0, batches: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("batches correctly for small arrays", async () => {
    mockSend
      .mockResolvedValueOnce({}) // BatchWriteCommand
      .mockResolvedValueOnce({ Item: null }) // GetCommand for meta
      .mockResolvedValueOnce({}); // PutCommand for meta update

    const points: TimeSeriesPoint[] = [
      { timestamp: 1737196200000, value: { glucose: 120 } },
      { timestamp: 1737196500000, value: { glucose: 125 } },
    ];

    const result = await storeDataPoints("bloodsugar", points, TEST_CONFIG);

    expect(result).toEqual({ stored: 2, batches: 1 });
  });

  it("splits into multiple batches for large arrays", async () => {
    // Mock for 3 batches + meta operations
    mockSend
      .mockResolvedValueOnce({}) // Batch 1
      .mockResolvedValueOnce({}) // Batch 2
      .mockResolvedValueOnce({}) // Batch 3
      .mockResolvedValueOnce({ Item: null }) // Get meta
      .mockResolvedValueOnce({}); // Put meta

    // Create 60 points (should need 3 batches of 25)
    const points: TimeSeriesPoint[] = Array.from({ length: 60 }, (_, i) => ({
      timestamp: 1737196200000 + i * 300000,
      value: { glucose: 100 + i },
    }));

    const result = await storeDataPoints("bloodsugar", points, TEST_CONFIG);

    expect(result).toEqual({ stored: 60, batches: 3 });
  });
});

describe("queryHistory", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("queries with correct key condition", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { timestamp: 1737196200000, value: { glucose: 120 } },
        { timestamp: 1737196500000, value: { glucose: 125 } },
      ],
    });

    const since = 1737190000000;
    const until = 1737200000000;

    await queryHistory("bloodsugar", since, until);

    const queryCall = mockSend.mock.calls[0][0];
    expect(queryCall.TableName).toBe("test-table");
    expect(queryCall.KeyConditionExpression).toBe(
      "pk = :pk AND sk BETWEEN :since AND :until"
    );
    expect(queryCall.ExpressionAttributeValues[":pk"]).toBe(
      "WIDGET#bloodsugar#HISTORY"
    );
  });

  it("returns formatted time series points", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { timestamp: 1737196200000, value: { glucose: 120 }, meta: { trend: "Flat" } },
        { timestamp: 1737196500000, value: { glucose: 125 } },
      ],
    });

    const result = await queryHistory("bloodsugar", 0, Date.now());

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      timestamp: 1737196200000,
      value: { glucose: 120 },
      meta: { trend: "Flat" },
    });
    expect(result[1]).toEqual({
      timestamp: 1737196500000,
      value: { glucose: 125 },
    });
  });

  it("returns empty array when no items found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await queryHistory("bloodsugar", 0, Date.now());

    expect(result).toEqual([]);
  });
});

describe("getHistoryMeta", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns meta when found", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        pk: "WIDGET#bloodsugar#HISTORY",
        sk: "META",
        widgetId: "bloodsugar",
        lastDataPointAt: 1737196200000,
        totalPointsStored: 100,
      },
    });

    const result = await getHistoryMeta("bloodsugar");

    expect(result).toEqual({
      pk: "WIDGET#bloodsugar#HISTORY",
      sk: "META",
      widgetId: "bloodsugar",
      lastDataPointAt: 1737196200000,
      totalPointsStored: 100,
    });
  });

  it("returns null when not found", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await getHistoryMeta("bloodsugar");

    expect(result).toBeNull();
  });
});

describe("needsBackfill", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns needed=true with full depth when no meta exists", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const result = await needsBackfill("bloodsugar", TEST_CONFIG);

    expect(result.needed).toBe(true);
    expect(result.gapMinutes).toBe(Infinity);
    expect(result.since).toBeDefined();
    // since should be ~24 hours ago
    const expectedSince = Date.now() - 24 * 60 * 60 * 1000;
    expect(result.since).toBeCloseTo(expectedSince, -4);
  });

  it("returns needed=true when gap exceeds threshold", async () => {
    const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;
    mockSend.mockResolvedValueOnce({
      Item: { lastDataPointAt: twentyMinutesAgo },
    });

    const result = await needsBackfill("bloodsugar", TEST_CONFIG);

    expect(result.needed).toBe(true);
    expect(result.gapMinutes).toBeCloseTo(20, 0);
  });

  it("returns needed=false when gap is within threshold", async () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    mockSend.mockResolvedValueOnce({
      Item: { lastDataPointAt: fiveMinutesAgo },
    });

    const result = await needsBackfill("bloodsugar", TEST_CONFIG);

    expect(result.needed).toBe(false);
    expect(result.gapMinutes).toBeCloseTo(5, 0);
    expect(result.since).toBeUndefined();
  });

  it("respects backfillDepthHours limit", async () => {
    // Last point was 48 hours ago
    const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
    mockSend.mockResolvedValueOnce({
      Item: { lastDataPointAt: fortyEightHoursAgo },
    });

    const result = await needsBackfill("bloodsugar", TEST_CONFIG);

    // since should be limited to 24 hours ago, not 48
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    expect(result.since).toBeCloseTo(twentyFourHoursAgo, -4);
  });
});

describe("isDuplicate", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns true when point exists within dedupe window", async () => {
    const timestamp = 1737196200000;
    mockSend.mockResolvedValueOnce({
      Items: [{ timestamp: timestamp + 60000 }], // 1 minute later
    });

    const result = await isDuplicate("bloodsugar", timestamp, 5);

    expect(result).toBe(true);
  });

  it("returns false when no points exist within window", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await isDuplicate("bloodsugar", 1737196200000, 5);

    expect(result).toBe(false);
  });
});
