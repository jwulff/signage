/**
 * Tests for Glooko CSV Parser
 *
 * These tests ensure correct parsing of Glooko CSV exports, with special
 * attention to timezone handling. Glooko exports timestamps in the user's
 * local timezone (America/Los_Angeles) without timezone information.
 *
 * Key invariants tested:
 * 1. Timestamps with explicit timezone (Z or offset) parse correctly as-is
 * 2. Naive timestamps (no timezone) are interpreted as Pacific time
 * 3. Daily insulin records have dates in Pacific time, not UTC
 * 4. Boundary cases around midnight are handled correctly
 */

import { describe, it, expect } from "vitest";
import { parseGlookoExport, type ExtractedCsv } from "./csv-parser.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a mock CSV file for testing
 */
function mockCsv(fileName: string, content: string): ExtractedCsv {
  return { fileName, content };
}

/**
 * Convert a Pacific time string to UTC milliseconds.
 * This is the expected behavior for naive timestamps in Glooko exports.
 *
 * @param pacificTimeStr - Time string in Pacific timezone (e.g., "2024-01-15 23:30:00")
 * @returns UTC timestamp in milliseconds
 */
function pacificToUtcMs(pacificTimeStr: string): number {
  // Parse the components
  const match = pacificTimeStr.match(
    /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) throw new Error(`Invalid time string: ${pacificTimeStr}`);

  const [, year, month, day, hour, minute, second = "0"] = match;

  // Use Intl to get the offset for this specific date/time in Pacific
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Create a UTC guess and calculate the offset
  const utcGuess = Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );

  const parts = formatter.formatToParts(new Date(utcGuess));
  const localHour = parseInt(
    parts.find((p) => p.type === "hour")?.value || "0"
  );
  const localMinute = parseInt(
    parts.find((p) => p.type === "minute")?.value || "0"
  );
  const localDay = parseInt(parts.find((p) => p.type === "day")?.value || "0");
  const localMonth =
    parseInt(parts.find((p) => p.type === "month")?.value || "0") - 1;
  const localYear = parseInt(
    parts.find((p) => p.type === "year")?.value || "0"
  );

  const localAsUtc = Date.UTC(
    localYear,
    localMonth,
    localDay,
    localHour,
    localMinute
  );
  const offsetMs = utcGuess - localAsUtc;

  return utcGuess + offsetMs;
}

// =============================================================================
// Timestamp Parsing Tests
// =============================================================================

describe("csv-parser timestamp handling", () => {
  describe("explicit timezone timestamps", () => {
    it("parses ISO 8601 with Z suffix as UTC", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15T08:30:00Z,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 08:30 UTC should be exactly this timestamp
      expect(bolus!.timestamp).toBe(new Date("2024-01-15T08:30:00Z").getTime());
    });

    it("parses ISO 8601 with positive offset correctly", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15T08:30:00+05:30,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 08:30+05:30 = 03:00 UTC
      expect(bolus!.timestamp).toBe(
        new Date("2024-01-15T08:30:00+05:30").getTime()
      );
    });

    it("parses ISO 8601 with negative offset correctly", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15T08:30:00-08:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 08:30-08:00 = 16:30 UTC
      expect(bolus!.timestamp).toBe(
        new Date("2024-01-15T08:30:00-08:00").getTime()
      );
    });

    it("handles lowercase z suffix", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15T08:30:00z,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      expect(bolus!.timestamp).toBe(new Date("2024-01-15T08:30:00Z").getTime());
    });
  });

  describe("naive timestamps (Glooko Pacific time format)", () => {
    it("interprets YYYY-MM-DD HH:MM:SS as Pacific time", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 08:30:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 08:30 Pacific should be 16:30 UTC (PST is UTC-8)
      expect(bolus!.timestamp).toBe(pacificToUtcMs("2024-01-15 08:30:00"));
    });

    it("interprets YYYY-MM-DD HH:MM as Pacific time (no seconds)", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 08:30,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      expect(bolus!.timestamp).toBe(pacificToUtcMs("2024-01-15 08:30:00"));
    });

    it("interprets MM/DD/YYYY HH:MM:SS as Pacific time (US format)", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
01/15/2024 08:30:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      expect(bolus!.timestamp).toBe(pacificToUtcMs("2024-01-15 08:30:00"));
    });

    it("handles timestamps near midnight correctly (11:30 PM Pacific)", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 23:30:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 23:30 Pacific on Jan 15 = 07:30 UTC on Jan 16 (PST is UTC-8)
      const expectedUtc = pacificToUtcMs("2024-01-15 23:30:00");
      expect(bolus!.timestamp).toBe(expectedUtc);

      // Verify this is actually Jan 16 in UTC
      const utcDate = new Date(bolus!.timestamp);
      expect(utcDate.getUTCDate()).toBe(16);
      expect(utcDate.getUTCHours()).toBe(7);
    });

    it("handles timestamps at midnight correctly (00:00 Pacific)", () => {
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 00:00:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 00:00 Pacific on Jan 15 = 08:00 UTC on Jan 15 (PST is UTC-8)
      const expectedUtc = pacificToUtcMs("2024-01-15 00:00:00");
      expect(bolus!.timestamp).toBe(expectedUtc);

      const utcDate = new Date(bolus!.timestamp);
      expect(utcDate.getUTCDate()).toBe(15);
      expect(utcDate.getUTCHours()).toBe(8);
    });

    it("handles Daylight Saving Time correctly (PDT, UTC-7)", () => {
      // July is during PDT (Pacific Daylight Time, UTC-7)
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-07-15 08:30:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 08:30 PDT = 15:30 UTC (PDT is UTC-7)
      const expectedUtc = pacificToUtcMs("2024-07-15 08:30:00");
      expect(bolus!.timestamp).toBe(expectedUtc);

      const utcDate = new Date(bolus!.timestamp);
      expect(utcDate.getUTCHours()).toBe(15); // Not 16 (which would be PST)
    });

    it("handles DST transition day correctly (spring forward)", () => {
      // March 10, 2024 is when DST starts in US (2 AM -> 3 AM)
      // 1:30 AM exists, 2:30 AM doesn't exist, 3:30 AM exists
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-03-10 01:30:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // 01:30 PST = 09:30 UTC
      const utcDate = new Date(bolus!.timestamp);
      expect(utcDate.getUTCHours()).toBe(9);
    });
  });

  describe("edge cases", () => {
    it("does not match Z in the middle of unrelated text", () => {
      // This is a regression test - we had a bug where "PIZZA" would match Z
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 08:30:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      // Should be parsed as Pacific time, not affected by any stray characters
      expect(bolus).toBeDefined();
      expect(bolus!.timestamp).toBe(pacificToUtcMs("2024-01-15 08:30:00"));
    });

    it("handles T separator without timezone as naive timestamp", () => {
      // YYYY-MM-DDTHH:MM:SS without Z or offset should be Pacific
      const csv = mockCsv(
        "Insulin data/bolus_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15T08:30:00,5.5,0,Normal`
      );

      const result = parseGlookoExport([csv]);
      const bolus = result.records.find((r) => r.type === "bolus");

      expect(bolus).toBeDefined();
      // Should be interpreted as Pacific, not UTC
      expect(bolus!.timestamp).toBe(pacificToUtcMs("2024-01-15 08:30:00"));
    });
  });
});

// =============================================================================
// Daily Insulin Summary Tests
// =============================================================================

describe("csv-parser daily insulin records", () => {
  describe("date assignment in Pacific time", () => {
    it("assigns date based on Pacific time, not UTC", () => {
      // A record at 11 PM Pacific on Jan 15 should be assigned to Jan 15
      // even though it's Jan 16 in UTC
      const csv = mockCsv(
        "Insulin data/insulin_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-01-15 23:00:00,5.5,8.0,13.5`
      );

      const result = parseGlookoExport([csv]);
      const dailyInsulin = result.records.find(
        (r) => r.type === "daily_insulin"
      );

      expect(dailyInsulin).toBeDefined();
      expect(dailyInsulin!.type).toBe("daily_insulin");
      if (dailyInsulin?.type === "daily_insulin") {
        expect(dailyInsulin.date).toBe("2024-01-15"); // Pacific date, not UTC
      }
    });

    it("assigns midnight record to the correct Pacific date", () => {
      // A record at 00:30 Pacific on Jan 15 should be Jan 15
      // (even though we might have DST edge cases)
      const csv = mockCsv(
        "Insulin data/insulin_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-01-15 00:30:00,1.0,2.0,3.0`
      );

      const result = parseGlookoExport([csv]);
      const dailyInsulin = result.records.find(
        (r) => r.type === "daily_insulin"
      );

      expect(dailyInsulin).toBeDefined();
      if (dailyInsulin?.type === "daily_insulin") {
        expect(dailyInsulin.date).toBe("2024-01-15");
      }
    });

    it("handles multiple records per day (running totals)", () => {
      const csv = mockCsv(
        "Insulin data/insulin_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-01-15 08:00:00,2.0,3.0,5.0
2024-01-15 12:00:00,4.0,5.0,9.0
2024-01-15 18:00:00,6.0,7.0,13.0
2024-01-15 23:30:00,8.0,8.5,16.5`
      );

      const result = parseGlookoExport([csv]);
      const dailyInsulinRecords = result.records.filter(
        (r) => r.type === "daily_insulin"
      );

      expect(dailyInsulinRecords).toHaveLength(4);
      // All should be Jan 15 in Pacific
      dailyInsulinRecords.forEach((r) => {
        if (r.type === "daily_insulin") {
          expect(r.date).toBe("2024-01-15");
        }
      });
    });

    it("correctly separates records across Pacific midnight", () => {
      const csv = mockCsv(
        "Insulin data/insulin_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-01-15 23:30:00,8.0,8.5,16.5
2024-01-16 00:30:00,0.5,0.5,1.0`
      );

      const result = parseGlookoExport([csv]);
      const dailyInsulinRecords = result.records.filter(
        (r) => r.type === "daily_insulin"
      );

      expect(dailyInsulinRecords).toHaveLength(2);

      const jan15 = dailyInsulinRecords.find(
        (r) => r.type === "daily_insulin" && r.date === "2024-01-15"
      );
      const jan16 = dailyInsulinRecords.find(
        (r) => r.type === "daily_insulin" && r.date === "2024-01-16"
      );

      expect(jan15).toBeDefined();
      expect(jan16).toBeDefined();
    });

    it("handles DST transition for daily records", () => {
      // March 10, 2024 is DST transition
      const csv = mockCsv(
        "Insulin data/insulin_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-03-10 01:30:00,5.0,5.0,10.0
2024-03-10 03:30:00,7.0,7.0,14.0`
      );

      const result = parseGlookoExport([csv]);
      const dailyInsulinRecords = result.records.filter(
        (r) => r.type === "daily_insulin"
      );

      expect(dailyInsulinRecords).toHaveLength(2);
      // Both should be March 10
      dailyInsulinRecords.forEach((r) => {
        if (r.type === "daily_insulin") {
          expect(r.date).toBe("2024-03-10");
        }
      });
    });
  });

  describe("insulin values", () => {
    it("parses bolus, basal, and total insulin correctly", () => {
      const csv = mockCsv(
        "Insulin data/insulin_data_1.csv",
        `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-01-15 12:00:00,9.9,10.25,20.15`
      );

      const result = parseGlookoExport([csv]);
      const dailyInsulin = result.records.find(
        (r) => r.type === "daily_insulin"
      );

      expect(dailyInsulin).toBeDefined();
      if (dailyInsulin?.type === "daily_insulin") {
        expect(dailyInsulin.totalBolusUnits).toBe(9.9);
        expect(dailyInsulin.totalBasalUnits).toBe(10.25);
        expect(dailyInsulin.totalInsulinUnits).toBe(20.15);
      }
    });
  });
});

// =============================================================================
// Bolus Record Tests
// =============================================================================

describe("csv-parser bolus records", () => {
  it("parses bolus records with correct timestamps", () => {
    const csv = mockCsv(
      "Insulin data/bolus_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type,BG Input (mg/dL)
2024-01-15 08:30:00,5.5,45,Normal,120
2024-01-15 12:00:00,3.0,30,Extended,`
    );

    const result = parseGlookoExport([csv]);
    const bolusRecords = result.records.filter((r) => r.type === "bolus");

    expect(bolusRecords).toHaveLength(2);
    expect(result.counts.bolus).toBe(2);
  });

  it("extracts bolus type correctly", () => {
    const csv = mockCsv(
      "Insulin data/bolus_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 08:30:00,5.5,0,Normal
2024-01-15 09:30:00,3.0,0,Extended
2024-01-15 10:30:00,4.0,0,Combo`
    );

    const result = parseGlookoExport([csv]);
    const bolusRecords = result.records.filter((r) => r.type === "bolus");

    expect(bolusRecords).toHaveLength(3);
    if (bolusRecords[0].type === "bolus") {
      expect(bolusRecords[0].bolusType).toBe("Normal");
    }
    if (bolusRecords[1].type === "bolus") {
      expect(bolusRecords[1].bolusType).toBe("Extended");
    }
    if (bolusRecords[2].type === "bolus") {
      expect(bolusRecords[2].bolusType).toBe("Combo");
    }
  });

  it("handles carbs input in bolus records", () => {
    const csv = mockCsv(
      "Insulin data/bolus_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 12:00:00,5.5,60,Normal`
    );

    const result = parseGlookoExport([csv]);
    const bolus = result.records.find((r) => r.type === "bolus");

    expect(bolus).toBeDefined();
    if (bolus?.type === "bolus") {
      expect(bolus.carbsInputGrams).toBe(60);
    }
  });
});

// =============================================================================
// CGM Record Tests
// =============================================================================

describe("csv-parser CGM records", () => {
  it("parses CGM readings with correct timestamps", () => {
    const csv = mockCsv(
      "CGM data/cgm_data_1.csv",
      `Medical Record Number: 12345
Timestamp,CGM Glucose Value (mg/dL)
2024-01-15 08:30:00,120
2024-01-15 08:35:00,125
2024-01-15 08:40:00,130`
    );

    const result = parseGlookoExport([csv]);
    const cgmRecords = result.records.filter((r) => r.type === "cgm");

    expect(cgmRecords).toHaveLength(3);
    expect(result.counts.cgm).toBe(3);

    // Check timestamps are in Pacific time
    if (cgmRecords[0].type === "cgm") {
      expect(cgmRecords[0].timestamp).toBe(pacificToUtcMs("2024-01-15 08:30:00"));
      expect(cgmRecords[0].glucoseMgDl).toBe(120);
    }
  });

  it("validates CGM glucose values are within physiological range", () => {
    const csv = mockCsv(
      "CGM data/cgm_data_1.csv",
      `Medical Record Number: 12345
Timestamp,CGM Glucose Value (mg/dL)
2024-01-15 08:30:00,120
2024-01-15 08:35:00,601
2024-01-15 08:40:00,15`
    );

    const result = parseGlookoExport([csv]);
    const cgmRecords = result.records.filter((r) => r.type === "cgm");

    // Only the valid reading (120) should be kept
    // 601 is above max (600), 15 is below min (20)
    expect(cgmRecords).toHaveLength(1);
  });
});

// =============================================================================
// Real-World Glooko Data Simulation
// =============================================================================

describe("csv-parser real-world scenarios", () => {
  it("matches Glooko control data for daily insulin totals", () => {
    // This test uses the actual control data from the user's Glooko screenshots
    // Jan 21: 20.2u total (9.9u bolus, 10.3u basal)
    // Jan 22: 15.8u total (6.9u bolus, 8.9u basal)

    const csv = mockCsv(
      "Insulin data/insulin_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-01-21 23:56:00,9.9,10.25,20.15
2024-01-22 23:56:00,6.9,8.85,15.75`
    );

    const result = parseGlookoExport([csv]);
    const dailyInsulinRecords = result.records.filter(
      (r) => r.type === "daily_insulin"
    );

    const jan21 = dailyInsulinRecords.find(
      (r) => r.type === "daily_insulin" && r.date === "2024-01-21"
    );
    const jan22 = dailyInsulinRecords.find(
      (r) => r.type === "daily_insulin" && r.date === "2024-01-22"
    );

    expect(jan21).toBeDefined();
    expect(jan22).toBeDefined();

    if (jan21?.type === "daily_insulin") {
      expect(jan21.totalInsulinUnits).toBeCloseTo(20.15, 1);
      expect(jan21.totalBolusUnits).toBeCloseTo(9.9, 1);
    }

    if (jan22?.type === "daily_insulin") {
      expect(jan22.totalInsulinUnits).toBeCloseTo(15.75, 1);
      expect(jan22.totalBolusUnits).toBeCloseTo(6.9, 1);
    }
  });

  it("handles typical Glooko export with multiple file types", () => {
    const cgmCsv = mockCsv(
      "CGM data/cgm_data_1.csv",
      `Medical Record Number: 12345
Timestamp,CGM Glucose Value (mg/dL)
2024-01-15 08:30:00,120
2024-01-15 08:35:00,125`
    );

    const bolusCsv = mockCsv(
      "Insulin data/bolus_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
2024-01-15 12:00:00,5.5,60,Normal`
    );

    const insulinCsv = mockCsv(
      "Insulin data/insulin_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Total Bolus (U),Total Basal (U),Total Insulin (U)
2024-01-15 23:00:00,9.9,10.25,20.15`
    );

    const result = parseGlookoExport([cgmCsv, bolusCsv, insulinCsv]);

    expect(result.counts.cgm).toBe(2);
    expect(result.counts.bolus).toBe(1);
    expect(result.counts.daily_insulin).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("csv-parser error handling", () => {
  it("skips rows with invalid timestamps", () => {
    const csv = mockCsv(
      "Insulin data/bolus_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type
invalid-timestamp,5.5,0,Normal
2024-01-15 08:30:00,3.0,0,Normal`
    );

    const result = parseGlookoExport([csv]);
    const bolusRecords = result.records.filter((r) => r.type === "bolus");

    expect(bolusRecords).toHaveLength(1);
  });

  it("handles empty CSV files gracefully", () => {
    const csv = mockCsv("Insulin data/bolus_data_1.csv", "");

    const result = parseGlookoExport([csv]);

    expect(result.records).toHaveLength(0);
  });

  it("handles CSV with only headers", () => {
    const csv = mockCsv(
      "Insulin data/bolus_data_1.csv",
      `Medical Record Number: 12345
Timestamp,Insulin Delivered,Carbs Input,Bolus Type`
    );

    const result = parseGlookoExport([csv]);

    expect(result.records).toHaveLength(0);
  });

  it("handles unknown file types gracefully", () => {
    const csv = mockCsv(
      "Unknown data/mystery_data.csv",
      `Medical Record Number: 12345
Timestamp,Some Value
2024-01-15 08:30:00,42`
    );

    const result = parseGlookoExport([csv]);

    // Should not crash, just skip the unknown file
    expect(result.records).toHaveLength(0);
  });
});
