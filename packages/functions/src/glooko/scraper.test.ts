/**
 * Tests for Glooko CSV parser
 */

import { describe, it, expect } from "vitest";
import { parseCsv } from "./scraper.js";

describe("parseCsv", () => {
  it("parses insulin treatments from CSV", () => {
    const csv = `Timestamp,Insulin Units,Carbs (g),Source
2024-01-15T08:30:00Z,5.5,,Pump
2024-01-15T12:00:00Z,3.0,,Manual`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(2);
    expect(treatments[0]).toEqual({
      timestamp: new Date("2024-01-15T08:30:00Z").getTime(),
      type: "insulin",
      value: 5.5,
      source: "Pump",
    });
    expect(treatments[1]).toEqual({
      timestamp: new Date("2024-01-15T12:00:00Z").getTime(),
      type: "insulin",
      value: 3.0,
      source: "Manual",
    });
  });

  it("parses carb treatments from CSV", () => {
    const csv = `Timestamp,Insulin,Carbohydrates,Source
2024-01-15T08:30:00Z,,45,Food
2024-01-15T12:00:00Z,,30,Snack`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(2);
    expect(treatments[0]).toEqual({
      timestamp: new Date("2024-01-15T08:30:00Z").getTime(),
      type: "carbs",
      value: 45,
      source: "Food",
    });
    expect(treatments[1]).toEqual({
      timestamp: new Date("2024-01-15T12:00:00Z").getTime(),
      type: "carbs",
      value: 30,
      source: "Snack",
    });
  });

  it("parses both insulin and carbs on the same row", () => {
    const csv = `DateTime,Bolus Units,Carb Grams
2024-01-15T12:00:00Z,4.5,60`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(2);

    const insulin = treatments.find((t) => t.type === "insulin");
    const carbs = treatments.find((t) => t.type === "carbs");

    expect(insulin?.value).toBe(4.5);
    expect(carbs?.value).toBe(60);
  });

  it("handles US date format (MM/DD/YYYY)", () => {
    const csv = `Timestamp,Insulin,Source
01/15/2024 08:30:00,5.0,Manual`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    // Should parse the US date format correctly
    expect(treatments[0].type).toBe("insulin");
    expect(treatments[0].value).toBe(5.0);
    expect(treatments[0].source).toBe("Manual");
  });

  it("handles quoted values with commas", () => {
    const csv = `Timestamp,Insulin,Source
2024-01-15T08:30:00Z,5.5,"Pump, Model X"`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].source).toBe("Pump, Model X");
  });

  it("ignores rows with zero values", () => {
    const csv = `Timestamp,Insulin,Carbs
2024-01-15T08:30:00Z,0,0
2024-01-15T12:00:00Z,5.0,0`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].value).toBe(5.0);
  });

  it("returns empty array for CSV with no data", () => {
    const csv = `Timestamp,Insulin,Carbs`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(0);
  });

  it("returns empty array for empty CSV", () => {
    const csv = ``;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(0);
  });

  it("sorts treatments by timestamp", () => {
    const csv = `Timestamp,Insulin,Carbs
2024-01-15T12:00:00Z,3.0,
2024-01-15T08:00:00Z,5.0,
2024-01-15T10:00:00Z,4.0,`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(3);
    expect(treatments[0].timestamp).toBeLessThan(treatments[1].timestamp);
    expect(treatments[1].timestamp).toBeLessThan(treatments[2].timestamp);
  });

  it("handles missing source column gracefully", () => {
    const csv = `Timestamp,Insulin
2024-01-15T08:30:00Z,5.5`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].source).toBeUndefined();
  });

  it("skips rows with invalid timestamps", () => {
    const csv = `Timestamp,Insulin,Carbs
invalid-date,5.0,
2024-01-15T12:00:00Z,3.0,`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].value).toBe(3.0);
  });
});
