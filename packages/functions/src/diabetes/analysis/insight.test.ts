/**
 * Tests for insight dedup logic (stripMarkup and dedup behavior)
 */

import { describe, it, expect } from "vitest";
import { stripMarkup } from "./insight-utils.js";

describe("stripMarkup", () => {
  it("strips simple color tags", () => {
    expect(stripMarkup("[green]Hello[/]")).toBe("hello");
  });

  it("strips multiple color tags", () => {
    expect(stripMarkup("[green]Good[/] [yellow]morning[/]")).toBe(
      "good morning"
    );
  });

  it("strips nested tags", () => {
    expect(stripMarkup("[green][yellow]text[/][/]")).toBe("text");
  });

  it("strips malformed unclosed tags", () => {
    expect(stripMarkup("[green]text")).toBe("text");
  });

  it("strips standalone closing tags", () => {
    expect(stripMarkup("text[/]")).toBe("text");
  });

  it("normalizes to lowercase", () => {
    expect(stripMarkup("Best Day This Week!")).toBe("best day this week!");
  });

  it("trims whitespace", () => {
    expect(stripMarkup("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(stripMarkup("")).toBe("");
  });

  it("handles text with no markup", () => {
    expect(stripMarkup("plain text here")).toBe("plain text here");
  });

  it("handles only tags", () => {
    expect(stripMarkup("[green][/]")).toBe("");
  });
});

describe("dedup matching", () => {
  it("matches case-insensitive duplicates", () => {
    const recent = ["Best day this week!"];
    const incoming = "BEST DAY THIS WEEK!";
    const normalizedNew = stripMarkup(incoming);
    const isDuplicate = recent.some(
      (r) => stripMarkup(r) === normalizedNew
    );
    expect(isDuplicate).toBe(true);
  });

  it("matches when markup differs but text is the same", () => {
    const recent = ["[green]Steady at 120[/]"];
    const incoming = "[yellow]Steady at 120[/]";
    const normalizedNew = stripMarkup(incoming);
    const isDuplicate = recent.some(
      (r) => stripMarkup(r) === normalizedNew
    );
    expect(isDuplicate).toBe(true);
  });

  it("does not match different text", () => {
    const recent = ["Steady at 120"];
    const incoming = "Trending up to 180";
    const normalizedNew = stripMarkup(incoming);
    const isDuplicate = recent.some(
      (r) => stripMarkup(r) === normalizedNew
    );
    expect(isDuplicate).toBe(false);
  });

  it("does not match partial text overlap", () => {
    const recent = ["Steady overnight"];
    const incoming = "Steady overnight and rising after breakfast";
    const normalizedNew = stripMarkup(incoming);
    const isDuplicate = recent.some(
      (r) => stripMarkup(r) === normalizedNew
    );
    expect(isDuplicate).toBe(false);
  });
});
