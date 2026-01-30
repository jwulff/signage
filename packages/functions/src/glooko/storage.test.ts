/**
 * Tests for Glooko storage key generation
 */

import { describe, it, expect } from "vitest";
import { generateRecordKeys } from "./storage.js";
import type { DailyInsulinSummary, BolusRecord } from "./data-model.js";

describe("generateRecordKeys", () => {
  describe("daily_insulin records", () => {
    it("uses date as sort key for daily_insulin records", () => {
      const record: DailyInsulinSummary = {
        type: "daily_insulin",
        timestamp: 1706400000000, // 2024-01-28T00:00:00Z
        date: "2024-01-27", // Pacific date
        totalBolusUnits: 10,
        totalBasalUnits: 8,
        totalInsulinUnits: 18,
        importedAt: Date.now(),
      };

      const keys = generateRecordKeys("primary", record);

      expect(keys.pk).toBe("USER#primary#DAILY_INSULIN");
      expect(keys.sk).toBe("2024-01-27"); // Date string, not timestamp
      expect(keys.gsi1pk).toBe("USER#primary");
      expect(keys.gsi1sk).toBe("DAILY_INSULIN#2024-01-27");
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

      const keys1 = generateRecordKeys("primary", record1);
      const keys2 = generateRecordKeys("primary", record2);

      // Both should have identical keys since they're for the same date
      expect(keys1.pk).toBe(keys2.pk);
      expect(keys1.sk).toBe(keys2.sk);
      expect(keys1.gsi1pk).toBe(keys2.gsi1pk);
      expect(keys1.gsi1sk).toBe(keys2.gsi1sk);
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

      const keys1 = generateRecordKeys("primary", record1);
      const keys2 = generateRecordKeys("primary", record2);

      // pk is same (same user, same type)
      expect(keys1.pk).toBe(keys2.pk);
      // sk is different (different dates)
      expect(keys1.sk).not.toBe(keys2.sk);
      expect(keys1.sk).toBe("2024-01-27");
      expect(keys2.sk).toBe("2024-01-28");
    });
  });

  describe("other record types", () => {
    it("uses timestamp+hash as sort key for bolus records", () => {
      const record: BolusRecord = {
        type: "bolus",
        timestamp: 1706400000000,
        bolusType: "Normal",
        bgInputMgDl: 120,
        carbsInputGrams: 45,
        carbRatio: 10,
        insulinDeliveredUnits: 4.5,
        importedAt: Date.now(),
      };

      const keys = generateRecordKeys("primary", record);

      expect(keys.pk).toBe("USER#primary#BOLUS");
      // sk should be timestamp (padded) + hash
      expect(keys.sk).toMatch(/^\d{15}#[a-f0-9]{12}$/);
      expect(keys.sk.startsWith("001706400000000#")).toBe(true);
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

      const keys1 = generateRecordKeys("primary", record1);
      const keys2 = generateRecordKeys("primary", record2);

      // pk is same
      expect(keys1.pk).toBe(keys2.pk);
      // sk is different because insulin/carbs are different (different hash)
      expect(keys1.sk).not.toBe(keys2.sk);
    });
  });
});
