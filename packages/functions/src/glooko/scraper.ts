/**
 * Glooko web scraper for treatment data export
 *
 * Uses Puppeteer to log into Glooko web interface and export CSV data
 * since Glooko doesn't provide a public API for this data.
 */

import type { Browser, Page } from "puppeteer-core";
import type {
  GlookoTreatment,
  GlookoScraperConfig,
  GlookoScraperResult,
} from "./types.js";

// Glooko URLs
const GLOOKO_LOGIN_URL = "https://my.glooko.com/users/sign_in";
const GLOOKO_EXPORT_URL = "https://my.glooko.com/export";

// Selectors (centralized for easy updates if Glooko UI changes)
const SELECTORS = {
  emailInput: 'input[name="user[email]"]',
  passwordInput: 'input[name="user[password]"]',
  submitButton: 'button[type="submit"]',
  loginError: ".alert-danger",
  exportButton: 'button[data-export="csv"]',
  dateRangeSelect: 'select[name="date_range"]',
  downloadLink: 'a[download]',
} as const;

// Timeouts
const LOGIN_TIMEOUT = 30000;
const EXPORT_TIMEOUT = 60000;
const NAVIGATION_TIMEOUT = 30000;

/**
 * Launch Puppeteer browser with appropriate configuration
 * Uses @sparticuz/chromium for Lambda compatibility
 */
export async function launchBrowser(): Promise<Browser> {
  // Dynamic import for Lambda layer compatibility
  const chromium = await import("@sparticuz/chromium");
  const puppeteer = await import("puppeteer-core");

  const executablePath = await chromium.default.executablePath();

  return puppeteer.default.launch({
    args: chromium.default.args,
    defaultViewport: chromium.default.defaultViewport,
    executablePath,
    headless: chromium.default.headless,
  });
}

/**
 * Log into Glooko web interface
 *
 * @param page Puppeteer page instance
 * @param email Glooko account email
 * @param password Glooko account password
 * @throws Error if login fails
 */
export async function loginToGlooko(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  console.log("Navigating to Glooko login page...");

  await page.goto(GLOOKO_LOGIN_URL, {
    waitUntil: "networkidle2",
    timeout: NAVIGATION_TIMEOUT,
  });

  // Wait for login form to be ready
  await page.waitForSelector(SELECTORS.emailInput, { timeout: LOGIN_TIMEOUT });

  console.log("Entering credentials...");

  // Fill in credentials
  await page.type(SELECTORS.emailInput, email, { delay: 50 });
  await page.type(SELECTORS.passwordInput, password, { delay: 50 });

  // Submit form
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: LOGIN_TIMEOUT }),
    page.click(SELECTORS.submitButton),
  ]);

  // Check for login error
  const loginError = await page.$(SELECTORS.loginError);
  if (loginError) {
    const errorText = await page.evaluate(
      (el) => el?.textContent?.trim() ?? "Unknown login error",
      loginError
    );
    throw new Error(`Glooko login failed: ${errorText}`);
  }

  // Verify we're logged in by checking URL or presence of user-specific element
  const currentUrl = page.url();
  if (currentUrl.includes("sign_in")) {
    throw new Error("Glooko login failed: Still on login page after submission");
  }

  console.log("Successfully logged into Glooko");
}

/**
 * Export CSV data from Glooko
 *
 * @param page Puppeteer page instance (must be logged in)
 * @param days Number of days of data to export
 * @returns CSV content as string
 */
export async function exportCsv(page: Page, days: number = 1): Promise<string> {
  console.log(`Navigating to Glooko export page for ${days} day(s)...`);

  await page.goto(GLOOKO_EXPORT_URL, {
    waitUntil: "networkidle2",
    timeout: NAVIGATION_TIMEOUT,
  });

  // Wait for export controls
  await page.waitForSelector(SELECTORS.exportButton, { timeout: EXPORT_TIMEOUT });

  // Set up download handler - intercept network response
  let csvContent = "";

  // Listen for CSV download response
  const csvPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("CSV download timed out"));
    }, EXPORT_TIMEOUT);

    page.on("response", async (response) => {
      const contentType = response.headers()["content-type"] || "";
      if (
        contentType.includes("text/csv") ||
        response.url().includes(".csv") ||
        response.url().includes("export")
      ) {
        try {
          const text = await response.text();
          if (text && text.includes(",")) {
            clearTimeout(timeout);
            resolve(text);
          }
        } catch {
          // Response body might not be available, continue listening
        }
      }
    });
  });

  // Select date range if available
  try {
    const dateRangeSelect = await page.$(SELECTORS.dateRangeSelect);
    if (dateRangeSelect) {
      // Select appropriate range based on days
      const rangeValue = days <= 1 ? "1" : days <= 7 ? "7" : "30";
      await page.select(SELECTORS.dateRangeSelect, rangeValue);
    }
  } catch {
    console.warn("Could not set date range, using default");
  }

  console.log("Triggering CSV export...");

  // Click export button
  await page.click(SELECTORS.exportButton);

  // Wait for CSV content
  csvContent = await csvPromise;

  console.log(`Received CSV content (${csvContent.length} bytes)`);

  return csvContent;
}

/**
 * Parse CSV content into treatment objects
 *
 * @param csvContent Raw CSV string from Glooko export
 * @returns Array of parsed treatment objects
 */
export function parseCsv(csvContent: string): GlookoTreatment[] {
  const treatments: GlookoTreatment[] = [];
  const lines = csvContent.trim().split("\n");

  if (lines.length < 2) {
    console.warn("CSV has no data rows");
    return treatments;
  }

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]);
  const columnMap = createColumnMap(header);

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const parsed = parseRow(row, columnMap);
    if (parsed) {
      treatments.push(...parsed);
    }
  }

  // Sort by timestamp
  treatments.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Parsed ${treatments.length} treatments from CSV`);

  return treatments;
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * Create a mapping from column names to indices
 */
function createColumnMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  const normalizedHeader = header.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  // Map common column name variations
  const columnAliases: Record<string, string[]> = {
    timestamp: ["timestamp", "datetime", "date", "time", "localtime"],
    insulin: ["insulin", "insulinunits", "bolusunits", "totalinsulin", "bolus"],
    carbs: ["carbs", "carbsgrams", "carbohydrates", "carbgrams", "carb"],
    source: ["source", "device", "origin"],
  };

  for (let i = 0; i < normalizedHeader.length; i++) {
    const normalized = normalizedHeader[i];
    for (const [key, aliases] of Object.entries(columnAliases)) {
      if (aliases.some((alias) => normalized.includes(alias))) {
        map.set(key, i);
        break;
      }
    }
  }

  return map;
}

/**
 * Parse a data row into treatments
 */
function parseRow(
  values: string[],
  columnMap: Map<string, number>
): GlookoTreatment[] | null {
  const treatments: GlookoTreatment[] = [];

  // Get timestamp
  const timestampIdx = columnMap.get("timestamp");
  if (timestampIdx === undefined || !values[timestampIdx]) {
    return null;
  }

  const timestamp = parseTimestamp(values[timestampIdx]);
  if (!timestamp) {
    return null;
  }

  // Get source (optional)
  const sourceIdx = columnMap.get("source");
  const source = sourceIdx !== undefined ? values[sourceIdx] : undefined;

  // Check for insulin
  const insulinIdx = columnMap.get("insulin");
  if (insulinIdx !== undefined && values[insulinIdx]) {
    const insulinValue = parseFloat(values[insulinIdx]);
    if (!isNaN(insulinValue) && insulinValue > 0) {
      treatments.push({
        timestamp,
        type: "insulin",
        value: insulinValue,
        source,
      });
    }
  }

  // Check for carbs
  const carbsIdx = columnMap.get("carbs");
  if (carbsIdx !== undefined && values[carbsIdx]) {
    const carbsValue = parseFloat(values[carbsIdx]);
    if (!isNaN(carbsValue) && carbsValue > 0) {
      treatments.push({
        timestamp,
        type: "carbs",
        value: carbsValue,
        source,
      });
    }
  }

  return treatments.length > 0 ? treatments : null;
}

/**
 * Parse a timestamp string into Unix milliseconds
 */
function parseTimestamp(value: string): number | null {
  if (!value) return null;

  // Try ISO format first
  let date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }

  // Try common date formats
  // MM/DD/YYYY HH:MM:SS
  const usFormat = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
  if (usFormat) {
    const [, month, day, year, hour, minute, second = "0"] = usFormat;
    date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // Try Unix timestamp (seconds or milliseconds)
  const numValue = parseFloat(value);
  if (!isNaN(numValue)) {
    // If less than year 2000 in ms, assume it's seconds
    if (numValue < 946684800000) {
      return numValue * 1000;
    }
    return numValue;
  }

  console.warn(`Could not parse timestamp: ${value}`);
  return null;
}

/**
 * Run the full scraping process
 *
 * @param config Scraper configuration
 * @returns Scraper result with treatments or error
 */
export async function scrapeGlooko(
  config: GlookoScraperConfig
): Promise<GlookoScraperResult> {
  const { email, password, exportDays = 1 } = config;
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await loginToGlooko(page, email, password);
    const csvContent = await exportCsv(page, exportDays);
    const treatments = parseCsv(csvContent);

    return {
      success: true,
      treatments,
      scrapedAt: Date.now(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Glooko scraper failed:", errorMessage);

    return {
      success: false,
      treatments: [],
      error: errorMessage,
      scrapedAt: Date.now(),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// SST Resource types for this handler
// These will be properly typed when infra secrets are defined
interface GlookoResource {
  GlookoEmail: { value: string };
  GlookoPassword: { value: string };
  SignageTable: { name: string };
}

/**
 * Lambda handler for scheduled scraping
 */
export async function handler(): Promise<{ statusCode: number; body: string }> {
  // Get credentials from SST secrets
  const { Resource } = await import("sst");
  const resource = Resource as unknown as GlookoResource;

  const email = resource.GlookoEmail?.value;
  const password = resource.GlookoPassword?.value;

  if (!email || !password) {
    console.error("Glooko credentials not configured");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Glooko credentials not configured" }),
    };
  }

  const result = await scrapeGlooko({ email, password, exportDays: 1 });

  if (result.success) {
    // Store treatments in DynamoDB
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { PutCommand, DynamoDBDocumentClient } = await import(
      "@aws-sdk/lib-dynamodb"
    );

    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    const tableName = resource.SignageTable.name;

    // Store the treatments
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: "GLOOKO#TREATMENTS",
          sk: "DATA",
          treatments: result.treatments,
          lastFetchedAt: result.scrapedAt,
          ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hour TTL
        },
      })
    );

    // Update scraper state
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: "GLOOKO#SCRAPER",
          sk: "STATE",
          lastRunAt: result.scrapedAt,
          lastSuccessAt: result.scrapedAt,
          consecutiveFailures: 0,
        },
      })
    );

    console.log(`Stored ${result.treatments.length} treatments`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        treatmentCount: result.treatments.length,
      }),
    };
  } else {
    // Update scraper state with failure
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { UpdateCommand, DynamoDBDocumentClient } = await import(
      "@aws-sdk/lib-dynamodb"
    );

    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    const tableName = resource.SignageTable.name;

    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          pk: "GLOOKO#SCRAPER",
          sk: "STATE",
        },
        UpdateExpression:
          "SET lastRunAt = :now, consecutiveFailures = if_not_exists(consecutiveFailures, :zero) + :one, lastError = :error",
        ExpressionAttributeValues: {
          ":now": result.scrapedAt,
          ":zero": 0,
          ":one": 1,
          ":error": result.error,
        },
      })
    );

    return {
      statusCode: 500,
      body: JSON.stringify({ error: result.error }),
    };
  }
}
