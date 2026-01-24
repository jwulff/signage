/**
 * Tests for text rendering utilities
 */

import { describe, it, expect } from "vitest";
import { measureText, measureTinyText, centerX } from "./text.js";

describe("measureTinyText", () => {
  it("returns 0 for empty string", () => {
    expect(measureTinyText("")).toBe(0);
  });

  it("returns correct width for single character", () => {
    // 3px width, no spacing needed
    expect(measureTinyText("0")).toBe(3);
  });

  it("returns correct width for two characters", () => {
    // 3px + 1px spacing + 3px = 7px
    expect(measureTinyText("21")).toBe(7);
  });

  it("returns correct width for three characters", () => {
    // 3px + 1px + 3px + 1px + 3px = 11px
    expect(measureTinyText("85%")).toBe(11);
  });

  it("returns correct width for longer strings", () => {
    // Each char is 3px + 1px spacing, minus 1px at end
    // "100%" = 4 chars = 4*4 - 1 = 15px
    expect(measureTinyText("100%")).toBe(15);
  });
});

describe("measureText", () => {
  it("returns correct width for text", () => {
    // Standard font is 5px wide + 1px spacing
    // Single char: 5px
    expect(measureText("A")).toBe(5);
    // Two chars: 5px + 1px + 5px = 11px
    expect(measureText("AB")).toBe(11);
  });
});

describe("centerX", () => {
  it("centers text on 64px display", () => {
    // For a 5px wide single char: (64 - 5) / 2 = 29.5 -> 29
    expect(centerX("A")).toBe(29);
  });
});
