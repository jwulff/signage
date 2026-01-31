/**
 * Tests for Glooko storage key generation
 *
 * Tests the new date-partitioned schema from @diabetes/core:
 * - PK: USR#{userId}#{TYPE}#{YYYY-MM-DD}
 * - SK: {timestamp}#{hash}
 * - GSI1: USR#{userId}#ALL / {timestamp}
 * - GSI2: USR#{userId}#{TYPE} / {date}#{timestamp}
 */

import { describe, it, expect } from "vitest";
import { generateRecordKeys } from "@diabetes/core";
import type { DailyInsulinSummary, BolusRecord } from "./data-model.js";

describe("generateRecordKeys", () => {
  describe("daily_insulin records", () => {
    it("uses date-partitioned pk and singleton sk for daily_insulin records", () => {
      const record: DailyInsulinSummary = {
        type: "daily_insulin",
        timestamp: 1706400000000, // 2024-01-28T00:00:00Z
        date: "2024-01-27", // Pacific date
        totalBolusUnits: 10,
        totalBasalUnits: 8,
        totalInsulinUnits: 18,
        importedAt: Date.now(),
      };

      const keys = generateRecordKeys("john", record);

      expect(keys.pk).toBe("USR#john#DAILY_INSULIN#2024-01-27");
      expect(keys.sk).toBe("_"); // Singleton per date
      expect(keys.gsi1pk).toBe("USR#john#ALL");
      expect(keys.gsi2pk).toBe("USR#john#DAILY_INSULIN");
      expect(keys.gsi2sk).toBe("2024-01-27");
    });

    it("generates same keys for same date regardless of timestamp", () => {
      // Two records for same date but different timestamps (running totals)
      const record1: DailyInsulinSummary = {
        type: "daily_insulin",
        timestamp: 1706400000000, // 8am
        date: "2024-01-27",
        totalBolusUnits: 5,
        totalBasalUnits: 4,
        totalInsulinUnits: 9,
        importedAt: Date.now(),
      };

      const record2: DailyInsulinSummary = {
        type: "daily_insulin",
        timestamp: 1706443200000, // 8pm (same day)
        date: "2024-01-27",
        totalBolusUnits: 10,
        totalBasalUnits: 8,
        totalInsulinUnits: 18,
        importedAt: Date.now(),
      };

      const keys1 = generateRecordKeys("john", record1);
      const keys2 = generateRecordKeys("john", record2);

      // Both should have identical pk and sk since they're for the same date
      expect(keys1.pk).toBe(keys2.pk);
      expect(keys1.sk).toBe(keys2.sk);
    });

    it("generates different keys for different dates", () => {
      const record1: DailyInsulinSummary = {
        type: "daily_insulin",
        timestamp: 1706400000000,
        date: "2024-01-27",
        totalBolusUnits: 10,
        totalBasalUnits: 8,
        totalInsulinUnits: 18,
        importedAt: Date.now(),
      };

      const record2: DailyInsulinSummary = {
        type: "daily_insulin",
        timestamp: 1706486400000,
        date: "2024-01-28",
        totalBolusUnits: 12,
        totalBasalUnits: 7,
        totalInsulinUnits: 19,
        importedAt: Date.now(),
      };

      const keys1 = generateRecordKeys("john", record1);
      const keys2 = generateRecordKeys("john", record2);

      // pk is different (includes date)
      expect(keys1.pk).not.toBe(keys2.pk);
      expect(keys1.pk).toBe("USR#john#DAILY_INSULIN#2024-01-27");
      expect(keys2.pk).toBe("USR#john#DAILY_INSULIN#2024-01-28");
      // sk is same (singleton)
      expect(keys1.sk).toBe(keys2.sk);
    });
  });

  describe("other record types", () => {
    it("uses date-partitioned pk and timestamp+hash sk for bolus records", () => {
      const record: BolusRecord = {
        type: "bolus",
        timestamp: 1706400000000, // 2024-01-28 00:00:00 UTC = 2024-01-27 16:00:00 PST
        bolusType: "Normal",
        bgInputMgDl: 120,
        carbsInputGrams: 45,
        carbRatio: 10,
        insulinDeliveredUnits: 4.5,
        importedAt: Date.now(),
      };

      const keys = generateRecordKeys("john", record);

      // pk includes date (in data timezone)
      expect(keys.pk).toMatch(/^USR#john#BOLUS#\d{4}-\d{2}-\d{2}$/);
      // sk should be timestamp (padded) + hash
      expect(keys.sk).toMatch(/^\d{15}#[a-f0-9]{12}$/);
      expect(keys.sk.startsWith("001706400000000#")).toBe(true);
      // GSI keys
      expect(keys.gsi1pk).toBe("USR#john#ALL");
      expect(keys.gsi2pk).toBe("USR#john#BOLUS");
    });

    it("generates different keys for different bolus records", () => {
      const record1: BolusRecord = {
        type: "bolus",
        timestamp: 1706400000000,
        bolusType: "Normal",
        bgInputMgDl: 120,
        carbsInputGrams: 45,
        carbRatio: 10,
        insulinDeliveredUnits: 4.5,
        importedAt: Date.now(),
      };

      const record2: BolusRecord = {
        type: "bolus",
        timestamp: 1706400000000, // Same timestamp
        bolusType: "Normal",
        bgInputMgDl: 120,
        carbsInputGrams: 30, // Different carbs
        carbRatio: 10,
        insulinDeliveredUnits: 3.0, // Different insulin
        importedAt: Date.now(),
      };

      const keys1 = generateRecordKeys("john", record1);
      const keys2 = generateRecordKeys("john", record2);

      // pk is same (same user, same type, same date)
      expect(keys1.pk).toBe(keys2.pk);
      // sk is different because insulin/carbs are different (different hash)
      expect(keys1.sk).not.toBe(keys2.sk);
    });
  });
});
