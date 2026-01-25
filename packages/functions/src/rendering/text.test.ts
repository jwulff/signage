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
    // Compact font is 3px wide + 1px spacing (same as tiny font)
    // Single char: 3px
    expect(measureText("A")).toBe(3);
    // Two chars: 3px + 1px + 3px = 7px
    expect(measureText("AB")).toBe(7);
  });
});

describe("centerX", () => {
  it("centers text on 64px display", () => {
    // For a 3px wide single char: (64 - 3) / 2 = 30.5 -> 30
    expect(centerX("A")).toBe(30);
  });
});
