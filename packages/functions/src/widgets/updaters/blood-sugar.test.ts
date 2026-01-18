import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bloodSugarUpdater,
  classifyRange,
  mapTrendArrow,
  isStale,
  type BloodSugarData,
} from "./blood-sugar";

// Mock the dexcom-share-api module
vi.mock("dexcom-share-api", () => ({
  DexcomClient: vi.fn(),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns properly structured data on success", async () => {
    const { DexcomClient } = await import("dexcom-share-api");

    const mockReading = {
      mgdl: 120,
      mmol: 6.7,
      trend: "Flat",
      timestamp: Date.now() - 5 * 60 * 1000,
    };

    const mockClient = {
      getEstimatedGlucoseValues: vi.fn().mockResolvedValue([mockReading]),
    };
    vi.mocked(DexcomClient).mockImplementation(() => mockClient as never);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;

    expect(result.glucose).toBe(120);
    expect(result.glucoseMmol).toBe(6.7);
    expect(result.trend).toBe("Flat");
    expect(result.trendArrow).toBe("→");
    expect(result.rangeStatus).toBe("normal");
    expect(result.isStale).toBe(false);
    expect(typeof result.timestamp).toBe("number");
  });

  it("handles empty readings array", async () => {
    const { DexcomClient } = await import("dexcom-share-api");

    const mockClient = {
      getEstimatedGlucoseValues: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(DexcomClient).mockImplementation(() => mockClient as never);

    await expect(bloodSugarUpdater.update()).rejects.toThrow(
      "No glucose readings available"
    );
  });

  it("marks stale data correctly", async () => {
    const { DexcomClient } = await import("dexcom-share-api");

    const mockReading = {
      mgdl: 100,
      mmol: 5.6,
      trend: "Flat",
      timestamp: Date.now() - 15 * 60 * 1000, // 15 minutes ago
    };

    const mockClient = {
      getEstimatedGlucoseValues: vi.fn().mockResolvedValue([mockReading]),
    };
    vi.mocked(DexcomClient).mockImplementation(() => mockClient as never);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;
    expect(result.isStale).toBe(true);
  });

  it("calculates delta between readings", async () => {
    const { DexcomClient } = await import("dexcom-share-api");

    const now = Date.now();
    const mockReadings = [
      { mgdl: 130, mmol: 7.2, trend: "SingleUp", timestamp: now },
      { mgdl: 120, mmol: 6.7, trend: "Flat", timestamp: now - 5 * 60 * 1000 },
    ];

    const mockClient = {
      getEstimatedGlucoseValues: vi.fn().mockResolvedValue(mockReadings),
    };
    vi.mocked(DexcomClient).mockImplementation(() => mockClient as never);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;
    expect(result.delta).toBe(10); // 130 - 120
  });

  it("returns delta of 0 when only one reading available", async () => {
    const { DexcomClient } = await import("dexcom-share-api");

    const mockReading = {
      mgdl: 120,
      mmol: 6.7,
      trend: "Flat",
      timestamp: Date.now(),
    };

    const mockClient = {
      getEstimatedGlucoseValues: vi.fn().mockResolvedValue([mockReading]),
    };
    vi.mocked(DexcomClient).mockImplementation(() => mockClient as never);

    const result = (await bloodSugarUpdater.update()) as BloodSugarData;
    expect(result.delta).toBe(0);
  });
});
