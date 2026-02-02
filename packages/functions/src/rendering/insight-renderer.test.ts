import { describe, it, expect } from "vitest";

// Test the color markup parsing logic used in insight-renderer
// These are unit tests for the parsing and splitting functions

describe("insight-renderer color markup", () => {
  // Helper to strip color markup (same logic as in the renderer)
  function stripColorMarkup(text: string): string {
    return text.replace(/\[(\w+)\](.*?)\[\/\]/g, "$2").replace(/\[\w+\]/g, "").replace(/\[\/\]/g, "");
  }

  describe("stripColorMarkup", () => {
    it("strips simple color markup", () => {
      expect(stripColorMarkup("[green]Hello[/]")).toBe("Hello");
    });

    it("strips multiple color segments", () => {
      expect(stripColorMarkup("[green]Hello[/] [red]world[/]")).toBe("Hello world");
    });

    it("strips rainbow markup", () => {
      expect(stripColorMarkup("[rainbow]Celebration![/]")).toBe("Celebration!");
    });

    it("preserves plain text", () => {
      expect(stripColorMarkup("No markup here")).toBe("No markup here");
    });

    it("handles mixed markup and plain text", () => {
      expect(stripColorMarkup("[green]In range[/] all day!")).toBe("In range all day!");
    });

    it("handles nested-looking markup correctly", () => {
      expect(stripColorMarkup("[green]text[/] middle [blue]more[/]")).toBe("text middle more");
    });
  });

  describe("color markup length calculation", () => {
    it("counts only visible characters", () => {
      const text = "[green]In range all day![/]";
      const visible = stripColorMarkup(text);
      expect(visible.length).toBe(17); // "In range all day!"
      expect(text.length).toBe(27); // includes markup: [green] (7) + text (17) + [/] (3) = 27
    });

    it("handles multiple colors in length calc", () => {
      const text = "[green]Nailed it[/] [rainbow]today![/]";
      const visible = stripColorMarkup(text);
      expect(visible.length).toBe(16); // "Nailed it today!"
    });
  });

  describe("color names supported", () => {
    const supportedColors = [
      "green", "red", "yellow", "orange", "blue",
      "white", "gray", "purple", "pink", "cyan", "rainbow"
    ];

    for (const color of supportedColors) {
      it(`supports ${color} color`, () => {
        const text = `[${color}]test[/]`;
        expect(stripColorMarkup(text)).toBe("test");
      });
    }
  });

  describe("insight examples with color", () => {
    const examples = [
      { marked: "[green]In range all day![/]", plain: "In range all day!", chars: 17 },
      { marked: "[green]Nailed it[/] [rainbow]today![/]", plain: "Nailed it today!", chars: 16 },
      { marked: "[rainbow]Best day this week![/]", plain: "Best day this week!", chars: 19 },
      { marked: "[green]Steady overnight![/]", plain: "Steady overnight!", chars: 17 },
      { marked: "[yellow]Running high[/], check it", plain: "Running high, check it", chars: 22 },
      { marked: "[red]Falling fast[/], grab snack", plain: "Falling fast, grab snack", chars: 24 },
      { marked: "More [blue]insulin[/] than usual", plain: "More insulin than usual", chars: 23 },
      { marked: "[blue]Calmer[/] than yesterday", plain: "Calmer than yesterday", chars: 21 },
      { marked: "Rough patch, [blue]hang in[/]", plain: "Rough patch, hang in", chars: 20 },
    ];

    for (const { marked, plain, chars } of examples) {
      it(`parses "${plain}" (${chars} chars)`, () => {
        const stripped = stripColorMarkup(marked);
        expect(stripped).toBe(plain);
        expect(stripped.length).toBe(chars);
        expect(stripped.length).toBeLessThanOrEqual(30); // Max display length
      });
    }
  });

  describe("validation with color markup", () => {
    // Replicate isValidInsight logic for testing
    function isValidInsight(content: string): boolean {
      const trimmed = content.trim();
      const withoutMarkup = trimmed.replace(/\[(\w+)\](.*?)\[\/\]/g, "$2").replace(/\[\w+\]/g, "").replace(/\[\/\]/g, "");

      if (withoutMarkup.length < 8) return false;
      if (withoutMarkup.startsWith("#") || withoutMarkup.startsWith("**")) return false;
      if (withoutMarkup.endsWith(":")) return false;
      if (trimmed.startsWith("{")) return false;
      if (trimmed.startsWith("[") && !trimmed.match(/^\[\w+\]/)) return false;
      if (withoutMarkup.toLowerCase().includes("key findings")) return false;
      if (withoutMarkup.toLowerCase().includes("analysis")) return false;

      return true;
    }

    it("accepts insight with color markup", () => {
      expect(isValidInsight("[green]In range all day![/]")).toBe(true);
    });

    it("accepts insight with multiple colors", () => {
      expect(isValidInsight("[green]Nailed it[/] [rainbow]today![/]")).toBe(true);
    });

    it("accepts mixed markup and plain text", () => {
      expect(isValidInsight("More [blue]insulin[/] than usual")).toBe(true);
    });

    it("rejects JSON arrays (not color markup)", () => {
      expect(isValidInsight("[1, 2, 3]")).toBe(false);
    });

    it("rejects JSON objects", () => {
      expect(isValidInsight("{\"key\": \"value\"}")).toBe(false);
    });

    it("rejects markdown even with color", () => {
      expect(isValidInsight("[green]**Bold**[/]")).toBe(false);
    });

    it("rejects too short content even with color", () => {
      expect(isValidInsight("[green]Hi[/]")).toBe(false);
    });
  });
});
