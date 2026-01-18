import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bloodSugarUpdater,
  classifyRange,
  mapTrendArrow,
  isStale,
  type BloodSugarData,
} from "./blood-sugar";

// Mock SST Resource
vi.mock("sst", () => ({
  Resource: {
    DexcomUsername: { value: "test-user" },
    DexcomPassword: { value: "test-pass" },
  },
}));

describe("classifyRange", () => {
  it("classifies urgent low (< 55 mg/dL)", () => {
    expect(classifyRange(54)).toBe("urgentLow");
    expect(classifyRange(40)).toBe("urgentLow");
  });

  it("classifies low (55-69 mg/dL)", () => {
    expect(classifyRange(55)).toBe("low");
    expect(classifyRange(69)).toBe("low");
  });

  it("classifies normal (70-180 mg/dL)", () => {
    expect(classifyRange(70)).toBe("normal");
    expect(classifyRange(120)).toBe("normal");
    expect(classifyRange(180)).toBe("normal");
  });

  it("classifies high (181-250 mg/dL)", () => {
    expect(classifyRange(181)).toBe("high");
    expect(classifyRange(250)).toBe("high");
  });

  it("classifies very high (> 250 mg/dL)", () => {
    expect(classifyRange(251)).toBe("veryHigh");
    expect(classifyRange(400)).toBe("veryHigh");
  });
});

describe("mapTrendArrow", () => {
  it("maps DoubleUp to ↑↑", () => {
    expect(mapTrendArrow("DoubleUp")).toBe("↑↑");
  });

  it("maps SingleUp to ↑", () => {
    expect(mapTrendArrow("SingleUp")).toBe("↑");
  });

  it("maps FortyFiveUp to ↗", () => {
    expect(mapTrendArrow("FortyFiveUp")).toBe("↗");
  });

  it("maps Flat to →", () => {
    expect(mapTrendArrow("Flat")).toBe("→");
  });

  it("maps FortyFiveDown to ↘", () => {
    expect(mapTrendArrow("FortyFiveDown")).toBe("↘");
  });

  it("maps SingleDown to ↓", () => {
    expect(mapTrendArrow("SingleDown")).toBe("↓");
  });

  it("maps DoubleDown to ↓↓", () => {
    expect(mapTrendArrow("DoubleDown")).toBe("↓↓");
  });

  it("handles lowercase trends", () => {
    expect(mapTrendArrow("flat")).toBe("→");
    expect(mapTrendArrow("fortyfiveup")).toBe("↗");
  });

  it("returns ? for unknown trends", () => {
    expect(mapTrendArrow("Unknown")).toBe("?");
    expect(mapTrendArrow("")).toBe("?");
  });
});

describe("isStale", () => {
  it("returns false for recent timestamps (< 10 minutes)", () => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    expect(isStale(fiveMinutesAgo, now)).toBe(false);
  });

  it("returns true for old timestamps (> 10 minutes)", () => {
    const now = Date.now();
    const fifteenMinutesAgo = now - 15 * 60 * 1000;
    expect(isStale(fifteenMinutesAgo, now)).toBe(true);
  });

  it("returns true for exactly 10 minutes", () => {
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    expect(isStale(tenMinutesAgo, now)).toBe(true);
  });

  it("uses current time by default", () => {
    const recentTimestamp = Date.now() - 1000; // 1 second ago
    expect(isStale(recentTimestamp)).toBe(false);
  });
});

describe("bloodSugarUpdater", () => {
  it("has correct id", () => {
    expect(bloodSugarUpdater.id).toBe("bloodsugar");
  });

  it("has correct name", () => {
    expect(bloodSugarUpdater.name).toBe("Blood Sugar Widget");
  });

  it("has 1 minute schedule", () => {
    expect(bloodSugarUpdater.schedule).toBe("rate(1 minute)");
  });
});

describe("bloodSugarUpdater.update", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  /**
   * Helper to create Dexcom API mock responses.
   */
  function mockDexcomResponses(readings: Array<{
    Value: number;
    Trend: string;
    WT: string;
  }>) {
    fetchMock
      // AuthenticatePublisherAccount
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-account-id"),
      })
      // LoginPublisherAccountById
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-session-id"),
      })
      // ReadPublisherLatestGlucoseValues
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(readings),
      });
  }

  it("returns properly structured data on success", async () => {
    const now = Date.now();
    mockDexcomResponses([
      {
        Value: 120,
        Trend: "Flat",
        WT: `Date(${now - 5 * 60 * 1000})`,
      },
    ]);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;

    expect(result.glucose).toBe(120);
    expect(result.glucoseMmol).toBe(6.7); // 120 / 18.0182 ≈ 6.66
    expect(result.trend).toBe("Flat");
    expect(result.trendArrow).toBe("→");
    expect(result.rangeStatus).toBe("normal");
    expect(result.isStale).toBe(false);
    expect(typeof result.timestamp).toBe("number");
  });

  it("handles empty readings array", async () => {
    mockDexcomResponses([]);

    await expect(bloodSugarUpdater.update()).rejects.toThrow(
      "No glucose readings available"
    );
  });

  it("marks stale data correctly", async () => {
    const now = Date.now();
    mockDexcomResponses([
      {
        Value: 100,
        Trend: "Flat",
        WT: `Date(${now - 15 * 60 * 1000})`, // 15 minutes ago
      },
    ]);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;
    expect(result.isStale).toBe(true);
  });

  it("calculates delta between readings", async () => {
    const now = Date.now();
    mockDexcomResponses([
      { Value: 130, Trend: "SingleUp", WT: `Date(${now})` },
      { Value: 120, Trend: "Flat", WT: `Date(${now - 5 * 60 * 1000})` },
    ]);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;
    expect(result.delta).toBe(10); // 130 - 120
  });

  it("returns delta of 0 when only one reading available", async () => {
    const now = Date.now();
    mockDexcomResponses([
      { Value: 120, Trend: "Flat", WT: `Date(${now})` },
    ]);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;
    expect(result.delta).toBe(0);
  });
});

describe("bloodSugarUpdater.historyConfig", () => {
  it("has history enabled", () => {
    expect(bloodSugarUpdater.historyConfig?.enabled).toBe(true);
  });

  it("has 24 hour retention", () => {
    expect(bloodSugarUpdater.historyConfig?.retentionHours).toBe(24);
  });

  it("has 24 hour backfill depth", () => {
    expect(bloodSugarUpdater.historyConfig?.backfillDepthHours).toBe(24);
  });

  it("has 15 minute backfill threshold", () => {
    expect(bloodSugarUpdater.historyConfig?.backfillThresholdMinutes).toBe(15);
  });

  it("has 5 minute dedupe window", () => {
    expect(bloodSugarUpdater.historyConfig?.dedupeWindowMinutes).toBe(5);
  });

  it("uses time-series storage type", () => {
    expect(bloodSugarUpdater.historyConfig?.storageType).toBe("time-series");
  });
});

describe("bloodSugarUpdater.fetchHistory", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  function mockDexcomHistoryResponses(readings: Array<{
    Value: number;
    Trend: string;
    WT: string;
  }>) {
    fetchMock
      // AuthenticatePublisherAccount
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-account-id"),
      })
      // LoginPublisherAccountById
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-session-id"),
      })
      // ReadPublisherLatestGlucoseValues (history)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(readings),
      });
  }

  it("is defined as a function", () => {
    expect(bloodSugarUpdater.fetchHistory).toBeDefined();
    expect(typeof bloodSugarUpdater.fetchHistory).toBe("function");
  });

  it("returns empty array when no readings available", async () => {
    mockDexcomHistoryResponses([]);

    const result = await bloodSugarUpdater.fetchHistory!(
      Date.now() - 60 * 60 * 1000,
      Date.now()
    );

    expect(result).toEqual([]);
  });

  it("returns time series points with correct structure", async () => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const tenMinutesAgo = now - 10 * 60 * 1000;

    mockDexcomHistoryResponses([
      { Value: 130, Trend: "SingleUp", WT: `Date(${fiveMinutesAgo})` },
      { Value: 120, Trend: "Flat", WT: `Date(${tenMinutesAgo})` },
    ]);

    const result = await bloodSugarUpdater.fetchHistory!(
      tenMinutesAgo - 1000,
      now
    );

    expect(result).toHaveLength(2);
    // Points should be in chronological order (oldest first)
    expect(result[0].timestamp).toBe(tenMinutesAgo);
    expect(result[0].value).toEqual({
      glucose: 120,
      glucoseMmol: 6.7,
      rangeStatus: "normal",
    });
    expect(result[0].meta).toEqual({
      trend: "Flat",
      trendArrow: "→",
      delta: 0, // First point has no previous
    });

    expect(result[1].timestamp).toBe(fiveMinutesAgo);
    expect(result[1].value).toEqual({
      glucose: 130,
      glucoseMmol: 7.2,
      rangeStatus: "normal",
    });
    expect(result[1].meta).toEqual({
      trend: "SingleUp",
      trendArrow: "↑",
      delta: 10, // 130 - 120
    });
  });

  it("filters points to requested time range", async () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    mockDexcomHistoryResponses([
      { Value: 130, Trend: "Flat", WT: `Date(${now - 30 * 60 * 1000})` },
      { Value: 120, Trend: "Flat", WT: `Date(${oneHourAgo - 30 * 60 * 1000})` },
    ]);

    // Request only the last hour
    const result = await bloodSugarUpdater.fetchHistory!(oneHourAgo, now);

    // Should only include the point from 30 minutes ago
    expect(result).toHaveLength(1);
    const value = result[0].value as { glucose: number };
    expect(value.glucose).toBe(130);
  });

  it("requests appropriate maxCount for time range", async () => {
    mockDexcomHistoryResponses([]);

    // Request 6 hours of data
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    await bloodSugarUpdater.fetchHistory!(sixHoursAgo, Date.now());

    // Should have called the glucose endpoint with appropriate params
    const glucoseCall = fetchMock.mock.calls[2];
    expect(glucoseCall[0]).toContain("minutes=360"); // 6 hours = 360 minutes
    // maxCount should be ~ 360/5 + 10 = 82
    expect(glucoseCall[0]).toMatch(/maxCount=\d{2,}/);
  });
});
