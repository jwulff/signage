/**
 * Local test script for Glooko scraper
 * Run with: npx tsx src/glooko/test-local.ts
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from repo root
config({ path: resolve(__dirname, "../../../../.env.local") });

import { scrapeGlooko } from "./scraper.js";

async function main() {
  const email = process.env.GLOOKO_EMAIL;
  const password = process.env.GLOOKO_PASSWORD;

  if (!email || !password) {
    console.error("Missing GLOOKO_EMAIL or GLOOKO_PASSWORD in .env.local");
    process.exit(1);
  }

  console.log(`Testing Glooko scraper with email: ${email}`);
  console.log("This will launch a headless browser and attempt to log in...\n");

  try {
    const result = await scrapeGlooko({
      email,
      password,
      exportDays: 1,
    });

    if (result.success) {
      console.log("\n=== SUCCESS ===");
      console.log(`Scraped at: ${new Date(result.scrapedAt).toISOString()}`);
      console.log(`Total treatments: ${result.treatments.length}`);

      if (result.treatments.length > 0) {
        console.log("\nSample treatments:");
        result.treatments.slice(0, 10).forEach((t) => {
          const time = new Date(t.timestamp).toLocaleString();
          console.log(`  ${time}: ${t.type} = ${t.value}${t.type === "insulin" ? "u" : "g"}`);
        });

        // Calculate 4h totals
        const now = Date.now();
        const fourHoursAgo = now - 4 * 60 * 60 * 1000;
        const recent = result.treatments.filter((t) => t.timestamp >= fourHoursAgo);

        const insulinTotal = recent
          .filter((t) => t.type === "insulin")
          .reduce((sum, t) => sum + t.value, 0);
        const carbsTotal = recent
          .filter((t) => t.type === "carbs")
          .reduce((sum, t) => sum + t.value, 0);

        console.log(`\n4-hour totals: ${insulinTotal.toFixed(1)}u insulin, ${carbsTotal}g carbs`);
      }
    } else {
      console.error("\n=== FAILED ===");
      console.error(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error("\n=== EXCEPTION ===");
    console.error(error);
  }
}

main();
