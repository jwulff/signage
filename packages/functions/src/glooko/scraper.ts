/**
 * Glooko web scraper for treatment data export
 *
 * Uses Puppeteer to log into Glooko web interface and export CSV data
 * since Glooko doesn't provide a public API for this data.
 */

// Declare browser globals for page.evaluate callbacks
// These are only used inside functions passed to Puppeteer that run in browser context
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const window: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

import type { Browser, Page } from "puppeteer-core";
import type {
  GlookoTreatment,
  GlookoScraperConfig,
  GlookoScraperResult,
  ExtractedCsv,
} from "./types.js";

// Debug flags - opt-in only to prevent PHI exposure
const DEBUG_SCREENSHOTS = process.env.DEBUG_SCREENSHOTS === "true";
const DEBUG_PERSIST_CSV = process.env.DEBUG_PERSIST_CSV === "true";

// Glooko URLs
const GLOOKO_LOGIN_URL = "https://my.glooko.com/users/sign_in";
// Note: After login, we're redirected to us.my.glooko.com
const GLOOKO_EXPORT_BASE = "https://us.my.glooko.com";

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

// ExtractedCsv is imported from types.ts

/**
 * Extract CSV files from a ZIP file buffer
 * Glooko exports data as a ZIP containing multiple CSV files
 */
async function extractCsvFilesFromZip(buffer: Buffer): Promise<ExtractedCsv[]> {
  const { inflateRawSync } = await import("zlib");

  // ZIP file format:
  // Local file header starts with 0x04034b50 (PK\003\004)
  // We need to find the CSV files and extract them

  let offset = 0;
  const csvFiles: ExtractedCsv[] = [];

  while (offset < buffer.length - 30) {
    // Check for local file header signature
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break; // No more files
    }

    // Parse local file header
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    // Get filename
    const fileName = buffer.toString("utf-8", offset + 30, offset + 30 + fileNameLength);

    // Calculate data offset
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    console.log(`ZIP entry: ${fileName} (compressed: ${compressedSize}, uncompressed: ${uncompressedSize}, method: ${compressionMethod})`);

    // Check if this is a CSV file
    if (fileName.toLowerCase().endsWith(".csv")) {
      const compressedData = buffer.slice(dataOffset, dataOffset + compressedSize);

      let csvContent: string;
      if (compressionMethod === 0) {
        // Stored (no compression)
        csvContent = compressedData.toString("utf-8");
      } else if (compressionMethod === 8) {
        // Deflate
        try {
          const decompressed = inflateRawSync(compressedData);
          csvContent = decompressed.toString("utf-8");
        } catch (err) {
          console.error(`Failed to decompress ${fileName}: ${err}`);
          offset = dataOffset + compressedSize;
          continue;
        }
      } else {
        console.warn(`Unknown compression method ${compressionMethod} for ${fileName}`);
        offset = dataOffset + compressedSize;
        continue;
      }

      console.log(`Extracted ${fileName}: ${csvContent.length} bytes`);
      csvFiles.push({ fileName, content: csvContent });
    }

    // Move to next file
    offset = dataOffset + compressedSize;
  }

  return csvFiles;
}

/**
 * Launch Puppeteer browser with appropriate configuration
 * Uses @sparticuz/chromium for Lambda, or system Chrome for local testing
 */
export async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  // Check if running locally (not in Lambda)
  const isLocal = !process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isLocal) {
    // Local testing: use system Chrome
    const possiblePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
    ];

    let executablePath: string | undefined;
    const { existsSync } = await import("fs");
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        executablePath = path;
        break;
      }
    }

    if (!executablePath) {
      throw new Error("No Chrome/Chromium installation found for local testing");
    }

    console.log(`Using local Chrome: ${executablePath}`);

    return puppeteer.default.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  // Lambda: use @sparticuz/chromium
  const chromium = await import("@sparticuz/chromium");
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

  // Debug: save screenshot only when explicitly enabled (contains PHI)
  if (DEBUG_SCREENSHOTS) {
    await page.screenshot({ path: "/tmp/glooko-login.png", fullPage: true });
    console.log("Screenshot saved to /tmp/glooko-login.png");
  }

  // Dismiss cookie consent banner if present
  const cookieButtonSelectors = [
    'button:has-text("Allow All")',
    'button:has-text("Reject All")',
    'button[aria-label="close"]',
    ".onetrust-close-btn-handler",
    "#onetrust-accept-btn-handler",
    'button:contains("Accept")',
  ];

  for (const selector of cookieButtonSelectors) {
    try {
      const cookieButton = await page.$(selector);
      if (cookieButton) {
        console.log(`Dismissing cookie banner with: ${selector}`);
        await cookieButton.click();
        await new Promise(r => setTimeout(r, 500));
        break;
      }
    } catch {
      // Selector not supported or element not found
    }
  }

  // Also try clicking by evaluating in page context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => {
    // This runs in browser context where DOM types exist
    const buttons = Array.from(document.querySelectorAll("button")) as any[];
    const allowAll = buttons.find(
      (btn: any) =>
        btn.textContent?.toLowerCase().includes("allow all") ||
        btn.textContent?.toLowerCase().includes("accept")
    );
    if (allowAll) {
      allowAll.click();
    }
  });
  await new Promise(r => setTimeout(r, 500));

  // Try multiple selectors for email input (Glooko may have different forms)
  const emailSelectors = [
    SELECTORS.emailInput,
    'input[type="email"]',
    'input[name="email"]',
    'input#email',
    'input[placeholder*="email" i]',
  ];

  let emailInput = null;
  for (const selector of emailSelectors) {
    emailInput = await page.$(selector);
    if (emailInput) {
      console.log(`Found email input with selector: ${selector}`);
      break;
    }
  }

  if (!emailInput) {
    // Log structural info for debugging (no PHI)
    const pageInfo = {
      title: await page.title(),
      url: page.url(),
      hasAnyInput: !!(await page.$("input")),
      hasForm: !!(await page.$("form")),
    };
    console.error("Login page state - email input not found:", JSON.stringify(pageInfo));
    throw new Error("Could not find email input on login page");
  }

  // Try multiple selectors for password input
  const passwordSelectors = [
    SELECTORS.passwordInput,
    'input[type="password"]',
    'input[name="password"]',
    'input#password',
  ];

  let passwordInput = null;
  for (const selector of passwordSelectors) {
    passwordInput = await page.$(selector);
    if (passwordInput) {
      console.log(`Found password input with selector: ${selector}`);
      break;
    }
  }

  if (!passwordInput) {
    throw new Error("Could not find password input on login page");
  }

  console.log("Entering credentials...");

  // Fill in credentials
  await emailInput.type(email, { delay: 50 });
  await passwordInput.type(password, { delay: 50 });

  // Try multiple selectors for submit button
  const submitSelectors = [
    SELECTORS.submitButton,
    'button[type="submit"]',
    'input[type="submit"]',
    'button:contains("Sign In")',
    'button:contains("Log In")',
    'button:contains("Login")',
    ".btn-primary",
    'button[data-testid="login-button"]',
  ];

  let submitButton = null;
  for (const selector of submitSelectors) {
    try {
      submitButton = await page.$(selector);
      if (submitButton) {
        console.log(`Found submit button with selector: ${selector}`);
        break;
      }
    } catch {
      // Some selectors like :contains may not be supported
    }
  }

  // If still not found, try to find any button with login-related text
  if (!submitButton) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    submitButton = await page.evaluateHandle((() => {
      const buttons = Array.from((document as any).querySelectorAll("button, input[type='submit']")) as any[];
      return buttons.find((btn: any) => {
        const text = btn.textContent?.toLowerCase() || "";
        const value = btn.value?.toLowerCase() || "";
        return (
          text.includes("sign in") ||
          text.includes("log in") ||
          text.includes("login") ||
          value.includes("sign in") ||
          value.includes("log in")
        );
      });
    }) as () => unknown);

    const element = submitButton.asElement();
    if (element) {
      submitButton = element;
      console.log("Found submit button by text content search");
    } else {
      // Take screenshot for debugging only when explicitly enabled (contains PHI)
      if (DEBUG_SCREENSHOTS) {
        await page.screenshot({ path: "/tmp/glooko-no-button.png", fullPage: true });
        console.log("Debug screenshot saved to /tmp/glooko-no-button.png");
      }
      throw new Error("Could not find submit button on login page");
    }
  }

  // Submit form - don't wait for navigation as it may be AJAX
  await (submitButton as unknown as { click: () => Promise<void> }).click();
  console.log("Clicked submit button, waiting for response...");

  // Wait for either navigation or URL change or error message
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: LOGIN_TIMEOUT }),
      page.waitForFunction(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (() => !(window as any).location.href.includes("sign_in")) as () => boolean,
        { timeout: LOGIN_TIMEOUT }
      ),
      page.waitForSelector(SELECTORS.loginError, { timeout: LOGIN_TIMEOUT }),
    ]);
  } catch {
    // Timeout is OK, check if we're logged in anyway
  }

  // Small delay for any final redirects
  await new Promise(r => setTimeout(r, 2000));

  if (DEBUG_SCREENSHOTS) {
    await page.screenshot({ path: "/tmp/glooko-after-login.png", fullPage: true });
    console.log("Post-login screenshot saved to /tmp/glooko-after-login.png");
  }

  // Check for login error
  const loginError = await page.$(SELECTORS.loginError);
  if (loginError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorText = await page.evaluate(
      (el: any) => el?.textContent?.trim() ?? "Unknown login error",
      loginError
    );
    throw new Error(`Glooko login failed: ${errorText}`);
  }

  // Also check for common error messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageText = await page.evaluate((() => (document as any).body.innerText) as () => string);
  if (
    pageText.toLowerCase().includes("invalid email") ||
    pageText.toLowerCase().includes("invalid password") ||
    pageText.toLowerCase().includes("incorrect")
  ) {
    throw new Error("Glooko login failed: Invalid credentials");
  }

  // Verify we're logged in by checking URL
  const currentUrl = page.url();
  console.log(`Current URL after login: ${currentUrl}`);

  if (currentUrl.includes("sign_in") || currentUrl.includes("login")) {
    if (DEBUG_SCREENSHOTS) {
      await page.screenshot({ path: "/tmp/glooko-login-failed.png", fullPage: true });
    }
    throw new Error("Glooko login failed: Still on login page after submission");
  }

  console.log("Successfully logged into Glooko");
}

/**
 * Export CSV data from Glooko
 *
 * @param page Puppeteer page instance (must be logged in)
 * @param days Number of days of data to export
 * @returns Array of extracted CSV files
 */
export async function exportCsv(page: Page, days: number = 1): Promise<ExtractedCsv[]> {

  // The export button is on the dashboard after login
  // Determine the base URL from current location (handles us.my.glooko.com redirect)
  const currentUrl = page.url();
  const baseUrl = currentUrl.includes("us.my.glooko.com")
    ? GLOOKO_EXPORT_BASE
    : "https://my.glooko.com";

  console.log(`Looking for export on Glooko dashboard for ${days} day(s)...`);
  console.log(`Current URL: ${currentUrl}`);

  // If not already on dashboard, navigate there
  if (!currentUrl.endsWith(".com/") && !currentUrl.endsWith(".com")) {
    console.log(`Navigating to dashboard: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT });
  }

  // Wait for dashboard to fully load
  await new Promise(r => setTimeout(r, 2000));

  if (DEBUG_SCREENSHOTS) {
    await page.screenshot({ path: "/tmp/glooko-dashboard.png", fullPage: true });
    console.log("Dashboard screenshot saved to /tmp/glooko-dashboard.png");
  }

  // Look for export button with multiple strategies
  const exportButtonSelectors = [
    SELECTORS.exportButton,
    'button[data-export="csv"]',
    'button:has-text("Export")',
    'a[href*="export"]',
    'a[href*="csv"]',
    'button[class*="export"]',
    '[data-testid*="export"]',
  ];

  let exportButton = null;
  for (const selector of exportButtonSelectors) {
    try {
      exportButton = await page.$(selector);
      if (exportButton) {
        console.log(`Found export button with selector: ${selector}`);
        break;
      }
    } catch {
      // Selector not supported
    }
  }

  // Try finding by text content
  if (!exportButton) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exportButton = await page.evaluateHandle((() => {
      const elements = Array.from((document as any).querySelectorAll("button, a")) as any[];
      return elements.find((el: any) => {
        const text = el.textContent?.toLowerCase() || "";
        return text.includes("export") || text.includes("download csv");
      });
    }) as () => unknown);

    const element = exportButton.asElement();
    if (element) {
      exportButton = element;
      console.log("Found export button by text content search");
    } else {
      exportButton = null;
    }
  }

  if (!exportButton) {
    // Dump page HTML for debugging only when explicitly enabled (contains PHI)
    if (DEBUG_PERSIST_CSV) {
      const html = await page.content();
      const { writeFileSync } = await import("fs");
      writeFileSync("/tmp/glooko-page.html", html);
      console.log("Page HTML saved to /tmp/glooko-page.html");
    }
    throw new Error("Could not find export button on Glooko");
  }

  // Set up download handler - intercept network response
  let csvContent = "";

  // Listen for CSV/ZIP download response
  const csvFilesPromise = new Promise<ExtractedCsv[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("CSV download timed out"));
    }, EXPORT_TIMEOUT);

    page.on("response", async (response) => {
      const contentType = response.headers()["content-type"] || "";
      const url = response.url();
      if (
        contentType.includes("text/csv") ||
        contentType.includes("application/csv") ||
        contentType.includes("application/zip") ||
        contentType.includes("application/octet-stream") ||
        url.includes("export_csv") ||
        url.includes(".csv") ||
        url.includes("download")
      ) {
        try {
          const buffer = await response.buffer();
          console.log(`Intercepted response from ${url} (${buffer.length} bytes)`);

          // Check if it's a ZIP file (starts with PK)
          if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
            console.log("Response is a ZIP file, extracting CSVs...");
            const csvFiles = await extractCsvFilesFromZip(buffer);
            if (csvFiles.length > 0) {
              clearTimeout(timeout);
              resolve(csvFiles);
            }
          } else {
            // It's a regular CSV
            const text = buffer.toString("utf-8");
            if (text && text.includes(",")) {
              clearTimeout(timeout);
              resolve([{ fileName: "data.csv", content: text }]);
            }
          }
        } catch (err) {
          console.error(`Error processing response: ${err}`);
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
      console.log(`Set date range to ${rangeValue} days`);
    }
  } catch {
    console.warn("Could not set date range, using default");
  }

  console.log("Triggering CSV export...");

  // Click export button
  await (exportButton as unknown as { click: () => Promise<void> }).click();

  // Wait for modal/dialog to appear
  await new Promise(r => setTimeout(r, 2000));

  if (DEBUG_SCREENSHOTS) {
    await page.screenshot({ path: "/tmp/glooko-after-export-click.png", fullPage: true });
    console.log("Screenshot saved to /tmp/glooko-after-export-click.png");
  }

  // Look for the Download button in the export modal
  // Log visible buttons in the modal for debugging
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modalButtons = await page.evaluate((() => {
    const dialog = (document as any).querySelector('[role="dialog"]') || (document as any).body;
    const buttons = Array.from(dialog.querySelectorAll("button")) as any[];
    return buttons.map((b: any) => ({
      text: b.textContent?.trim(),
      class: b.className,
      visible: b.getBoundingClientRect().width > 0,
    }));
  }) as () => Array<{ text: string; class: string; visible: boolean }>);
  console.log("Modal buttons:", JSON.stringify(modalButtons, null, 2));

  // Find and click the Export button in the modal
  // The modal has "Cancel" and "Export" buttons (not "Download")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exportClicked = await page.evaluate((() => {
    const buttons = Array.from((document as any).querySelectorAll("button")) as any[];

    // Look for the Export button (NOT "Export to CSV" which opens the modal)
    const exportBtn = buttons.find((btn: any) => {
      const text = btn.textContent?.trim().toLowerCase() || "";
      const className = btn.className || "";
      const rect = btn.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;

      // Must be visible, text is exactly "export", and NOT the "Export to CSV" button
      return isVisible &&
        text === "export" &&
        !className.includes("ExportToCSVButton");
    });

    if (exportBtn) {
      console.log("Found Export button:", exportBtn.className);
      exportBtn.click();
      return true;
    }
    return false;
  }) as () => boolean);

  if (exportClicked) {
    console.log("Clicked Export button in modal");
  } else {
    console.log("No Export button found in modal");

    // Log current buttons for debugging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentButtons = await page.evaluate((() => {
      return Array.from((document as any).querySelectorAll("button")).map((b: any) => ({
        text: b.textContent?.trim().substring(0, 50),
        class: b.className.substring(0, 50),
        visible: b.getBoundingClientRect().width > 0,
      }));
    }) as () => Array<{ text: string; class: string; visible: boolean }>);
    console.log("Current buttons:", JSON.stringify(currentButtons.filter(b => b.visible), null, 2));
  }

  // Wait for CSV files with extended timeout
  let csvFiles: ExtractedCsv[] | undefined;
  try {
    csvFiles = await Promise.race([
      csvFilesPromise,
      new Promise<ExtractedCsv[]>((_, reject) =>
        setTimeout(() => reject(new Error("CSV download timed out after modal interaction")), 30000)
      ),
    ]);
  } catch {
    // If direct download failed, check if there's a download link on the page
    console.log("Direct download failed, looking for download link...");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadLink = await page.evaluate((() => {
      const links = Array.from((document as any).querySelectorAll("a")) as any[];
      const csvLink = links.find((a: any) =>
        a.href?.includes(".csv") ||
        a.href?.includes("download") ||
        a.download?.includes(".csv")
      );
      return csvLink?.href;
    }) as () => string | undefined);

    if (downloadLink) {
      console.log(`Found download link: ${downloadLink}`);
      // Navigate to download link directly
      const response = await page.goto(downloadLink, { timeout: NAVIGATION_TIMEOUT });
      if (response) {
        csvContent = await response.text();
        csvFiles = [{ fileName: "download.csv", content: csvContent }];
      }
    }

    if (!csvFiles) {
      if (DEBUG_SCREENSHOTS) {
        await page.screenshot({ path: "/tmp/glooko-export-failed.png", fullPage: true });
        console.log("Debug screenshot saved to /tmp/glooko-export-failed.png");
      }
      if (DEBUG_PERSIST_CSV) {
        const html = await page.content();
        const { writeFileSync } = await import("fs");
        writeFileSync("/tmp/glooko-export-page.html", html);
        console.log("Debug HTML saved to /tmp/glooko-export-page.html");
      }
      throw new Error("Could not download CSV from Glooko");
    }
  }

  console.log(`Received ${csvFiles.length} CSV files`);

  return csvFiles;
}

/**
 * Parse CSV content into treatment objects (legacy single-file version)
 * This version handles arbitrary CSV formats with flexible column mapping
 *
 * @param csvContent Raw CSV string from Glooko export
 * @returns Array of parsed treatment objects
 */
export function parseCsv(csvContent: string): GlookoTreatment[] {
  const treatments: GlookoTreatment[] = [];
  const lines = csvContent.trim().split("\n");

  if (lines.length < 2) {
    return treatments;
  }

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]);
  const columnMap = createColumnMap(header);

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const parsed = parseRowLegacy(row, columnMap);
    if (parsed) {
      treatments.push(...parsed);
    }
  }

  // Sort by timestamp
  treatments.sort((a, b) => a.timestamp - b.timestamp);

  return treatments;
}

/**
 * Parse a data row into treatments (legacy version with flexible column mapping)
 */
function parseRowLegacy(
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
 * Parse multiple CSV files into treatment objects
 *
 * @param csvFiles Array of extracted CSV files from Glooko export
 * @returns Array of parsed treatment objects
 */
export function parseCsvFiles(csvFiles: ExtractedCsv[]): GlookoTreatment[] {
  const treatments: GlookoTreatment[] = [];

  // Save CSV files to /tmp for debugging only when explicitly enabled (contains PHI)
  if (DEBUG_PERSIST_CSV) {
    import("fs").then(({ writeFileSync, mkdirSync }) => {
      mkdirSync("/tmp/glooko-csvs", { recursive: true });
      for (const { fileName, content } of csvFiles) {
        const safeName = fileName.replace(/\//g, "_");
        writeFileSync(`/tmp/glooko-csvs/${safeName}`, content);
      }
      console.log(`Saved ${csvFiles.length} CSV files to /tmp/glooko-csvs/`);
    });
  }

  for (const { fileName, content } of csvFiles) {
    const lowerName = fileName.toLowerCase();

    // Determine file type and parse accordingly
    if (lowerName.includes("carbs")) {
      treatments.push(...parseCarbsCsv(content, fileName));
    } else if (lowerName.includes("bolus")) {
      treatments.push(...parseBolusCsv(content, fileName));
    } else if (lowerName.includes("insulin") && !lowerName.includes("basal")) {
      treatments.push(...parseInsulinCsv(content, fileName));
    }
    // Skip other files (cgm_data, bg_data, basal_data, etc.) as they don't contain treatment data we need
  }

  // Sort by timestamp
  treatments.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Parsed ${treatments.length} treatments from ${csvFiles.length} CSV files`);

  return treatments;
}

/**
 * Find the header row in CSV content
 * Glooko CSVs have a metadata row first, then the actual header
 */
function findHeaderAndDataStart(lines: string[]): { headerIdx: number; dataStartIdx: number } {
  // Check if first line is metadata (contains "Medical Record Number" or similar)
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes("medical record") || firstLine.includes("name:") || firstLine.includes("date range")) {
      // First line is metadata, second is header
      return { headerIdx: 1, dataStartIdx: 2 };
    }
  }
  // Normal CSV: first line is header
  return { headerIdx: 0, dataStartIdx: 1 };
}

/**
 * Parse carbs CSV file
 */
function parseCarbsCsv(content: string, fileName: string): GlookoTreatment[] {
  const treatments: GlookoTreatment[] = [];
  const lines = content.trim().split("\n");

  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) {
    return treatments;
  }

  const header = parseCSVLine(lines[headerIdx]);
  const timestampIdx = findColumnIndex(header, ["timestamp", "datetime", "date", "time", "localtime"]);
  const carbsIdx = findColumnIndex(header, ["carbs", "carbsgrams", "carbohydrates", "carbgrams", "carb", "value"]);

  if (timestampIdx === -1 || carbsIdx === -1) {
    console.warn(`Could not find required columns in ${fileName}: header=${header.join(",")}`);
    return treatments;
  }

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const timestamp = parseTimestamp(row[timestampIdx]);
    const carbsValue = parseFloat(row[carbsIdx]);

    if (timestamp && !isNaN(carbsValue) && carbsValue > 0) {
      treatments.push({
        timestamp,
        type: "carbs",
        value: carbsValue,
        source: fileName,
      });
    }
  }

  console.log(`Parsed ${treatments.length} carbs entries from ${fileName}`);
  return treatments;
}

/**
 * Parse bolus (insulin) CSV file
 * Glooko bolus files contain both insulin delivered and carbs input
 */
function parseBolusCsv(content: string, fileName: string): GlookoTreatment[] {
  const treatments: GlookoTreatment[] = [];
  const lines = content.trim().split("\n");

  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) {
    console.log(`${fileName}: No data rows (only ${lines.length} lines, need > ${dataStartIdx})`);
    return treatments;
  }

  const header = parseCSVLine(lines[headerIdx]);
  console.log(`${fileName} columns: ${header.join(", ")}`);

  const timestampIdx = findColumnIndex(header, ["timestamp", "datetime", "date", "time", "localtime"]);
  // Look specifically for "Insulin Delivered" column (not just "insulin" which matches "Insulin Type")
  const insulinIdx = findColumnIndex(header, [
    "insulindelivered", "insulin delivered", "delivered", "totaldelivered",
    "total delivered", "initialdelivery", "initial delivery"
  ]);
  // Also look for carbs in bolus file
  const carbsIdx = findColumnIndex(header, [
    "carbsinput", "carbs input", "carbs", "carbsgrams", "carbohydrates"
  ]);

  console.log(`${fileName}: timestampIdx=${timestampIdx}, insulinIdx=${insulinIdx}, carbsIdx=${carbsIdx}`);

  if (timestampIdx === -1) {
    console.warn(`Could not find timestamp column in ${fileName}: header=${header.join(",")}`);
    return treatments;
  }

  if (insulinIdx === -1 && carbsIdx === -1) {
    console.warn(`Could not find insulin or carbs columns in ${fileName}: header=${header.join(",")}`);
    return treatments;
  }

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const timestamp = parseTimestamp(row[timestampIdx]);

    if (!timestamp) continue;

    // Extract insulin
    if (insulinIdx !== -1) {
      const insulinValue = parseFloat(row[insulinIdx]);
      if (!isNaN(insulinValue) && insulinValue > 0) {
        treatments.push({
          timestamp,
          type: "insulin",
          value: insulinValue,
          source: fileName,
        });
      }
    }

    // Extract carbs
    if (carbsIdx !== -1) {
      const carbsValue = parseFloat(row[carbsIdx]);
      if (!isNaN(carbsValue) && carbsValue > 0) {
        treatments.push({
          timestamp,
          type: "carbs",
          value: carbsValue,
          source: fileName,
        });
      }
    }
  }

  const insulinCount = treatments.filter(t => t.type === "insulin").length;
  const carbsCount = treatments.filter(t => t.type === "carbs").length;
  console.log(`Parsed ${insulinCount} insulin + ${carbsCount} carbs entries from ${fileName}`);

  return treatments;
}

/**
 * Parse insulin CSV file (generic insulin data)
 */
function parseInsulinCsv(content: string, fileName: string): GlookoTreatment[] {
  const treatments: GlookoTreatment[] = [];
  const lines = content.trim().split("\n");

  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) {
    return treatments;
  }

  const header = parseCSVLine(lines[headerIdx]);
  const timestampIdx = findColumnIndex(header, ["timestamp", "datetime", "date", "time", "localtime"]);
  const insulinIdx = findColumnIndex(header, [
    "totalinsulin", "total insulin", "insulin", "bolus", "value",
    "insulinunits", "units", "dose"
  ]);

  if (timestampIdx === -1 || insulinIdx === -1) {
    console.warn(`Could not find required columns in ${fileName}: header=${header.join(",")}`);
    return treatments;
  }

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const timestamp = parseTimestamp(row[timestampIdx]);
    const insulinValue = parseFloat(row[insulinIdx]);

    if (timestamp && !isNaN(insulinValue) && insulinValue > 0) {
      treatments.push({
        timestamp,
        type: "insulin",
        value: insulinValue,
        source: fileName,
      });
    }
  }

  console.log(`Parsed ${treatments.length} insulin entries from ${fileName}`);
  return treatments;
}

/**
 * Find column index by checking multiple possible column names
 */
function findColumnIndex(header: string[], possibleNames: string[]): number {
  const normalizedHeader = header.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  for (let i = 0; i < normalizedHeader.length; i++) {
    const normalized = normalizedHeader[i];
    for (const name of possibleNames) {
      const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalized.includes(normalizedName) || normalizedName.includes(normalized)) {
        return i;
      }
    }
  }

  return -1;
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
 * The timezone that Glooko exports data in. This is the user's local timezone
 * configured in their Glooko account settings.
 */
const GLOOKO_EXPORT_TIMEZONE = "America/Los_Angeles";

/**
 * Parse a naive datetime (no timezone info) as if it's in the specified timezone,
 * returning UTC milliseconds. This handles DST correctly.
 */
function parseLocalDateTime(
  year: number,
  month: number, // 0-indexed
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): number {
  // Create a Date in UTC with these components as a starting guess
  const utcGuess = Date.UTC(year, month, day, hour, minute, second);

  // Format utcGuess in the target timezone to see what local time it maps to
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(utcGuess));
  const localHour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const localMinute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  const localDay = parseInt(parts.find(p => p.type === "day")?.value || "0");
  const localMonth = parseInt(parts.find(p => p.type === "month")?.value || "0") - 1;
  const localYear = parseInt(parts.find(p => p.type === "year")?.value || "0");

  // Create a UTC timestamp from the local components we observed
  // This gives us the "equivalent" UTC for what the timezone sees
  const localAsUtc = Date.UTC(localYear, localMonth, localDay, localHour, localMinute);

  // The offset is the difference between our guess and what local time it produced
  // offset = utcGuess - localAsUtc (positive if timezone is behind UTC)
  // To convert our target local time to UTC, we add this offset
  const offsetMs = utcGuess - localAsUtc;

  return utcGuess + offsetMs;
}

/**
 * Parse a timestamp string into Unix milliseconds.
 * Glooko exports timestamps in the user's local timezone (America/Los_Angeles),
 * so we parse them in that timezone to get correct UTC milliseconds.
 *
 * Timestamps with explicit timezone info (Z or offset) are parsed directly.
 */
function parseTimestamp(value: string): number | null {
  if (!value) return null;

  // FIRST: Check for explicit timezone info (Z or offset like +00:00 or -08:00)
  // These are unambiguous and should be parsed by new Date() directly.
  // This handles ISO 8601 like "2024-01-15T08:30:00Z" or "2024-01-15T08:30:00-08:00"
  // Anchor to end of string to avoid false positives (e.g., "PIZZA" matching Z)
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // Try YYYY-MM-DD HH:MM[:SS] format (common in Glooko CSV exports)
  // These are NAIVE timestamps (no timezone) that Glooko exports in user's local timezone.
  const isoLikeFormat = value.match(/(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoLikeFormat) {
    const [, year, month, day, hour, minute, second = "0"] = isoLikeFormat;
    const timestamp = parseLocalDateTime(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
      GLOOKO_EXPORT_TIMEZONE
    );
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }

  // Try US format MM/DD/YYYY HH:MM[:SS]
  const usFormat = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (usFormat) {
    const [, month, day, year, hour, minute, second = "0"] = usFormat;
    const timestamp = parseLocalDateTime(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
      GLOOKO_EXPORT_TIMEZONE
    );
    if (!isNaN(timestamp)) {
      return timestamp;
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
    const csvFiles = await exportCsv(page, exportDays);
    const treatments = parseCsvFiles(csvFiles);

    return {
      success: true,
      treatments,
      csvFiles, // Return raw CSV files for new parsing pipeline
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

// Default user ID for single-user system
const DEFAULT_USER_ID = "primary";

/**
 * Lambda handler for scheduled scraping
 *
 * This handler:
 * 1. Scrapes Glooko for CSV export data
 * 2. Parses all CSV files into strongly-typed records
 * 3. Stores records idempotently in DynamoDB (no duplicates)
 * 4. Stores import metadata for tracking
 * 5. Maintains legacy treatment summary for compositor compatibility
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

  const tableName = resource.SignageTable.name;

  // Run the scraper to get CSV files
  const result = await scrapeGlooko({ email, password, exportDays: 14 });

  if (result.success && result.csvFiles) {
    // Import the new storage and parser modules
    const { parseGlookoExport } = await import("./csv-parser.js");
    const { GlookoStorage } = await import("./storage.js");
    const { randomUUID } = await import("crypto");

    // Create storage instance
    const storage = new GlookoStorage(tableName, DEFAULT_USER_ID);

    // Use the CSV files returned from scrapeGlooko (single browser session)
    const csvFiles = result.csvFiles;

    try {
      // Parse all CSV files into strongly-typed records
      const parseResult = parseGlookoExport(csvFiles);

      console.log(`Parsed ${parseResult.records.length} records:`);
      for (const [type, count] of Object.entries(parseResult.counts)) {
        console.log(`  - ${type}: ${count}`);
      }

      if (parseResult.errors.length > 0) {
        console.warn(`Parse errors: ${parseResult.errors.join(", ")}`);
      }

      // Store all records idempotently
      const storeResult = await storage.storeRecords(parseResult.records);

      console.log(`Storage results:`);
      console.log(`  - Written: ${storeResult.written}`);
      console.log(`  - Duplicates: ${storeResult.duplicates}`);
      if (storeResult.errors.length > 0) {
        console.warn(`  - Errors: ${storeResult.errors.join(", ")}`);
      }

      // Store import metadata
      const importId = randomUUID();
      const dataStartDate = parseResult.records.length > 0
        ? new Date(Math.min(...parseResult.records.map(r => r.timestamp)))
            .toISOString()
            .split("T")[0]
        : new Date().toISOString().split("T")[0];
      const dataEndDate = parseResult.records.length > 0
        ? new Date(Math.max(...parseResult.records.map(r => r.timestamp)))
            .toISOString()
            .split("T")[0]
        : new Date().toISOString().split("T")[0];

      await storage.storeImportMetadata({
        importId,
        startedAt: result.scrapedAt,
        completedAt: Date.now(),
        dataStartDate,
        dataEndDate,
        recordCounts: parseResult.counts,
        totalRecords: parseResult.records.length,
        errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
      });

      // Also store legacy treatment summary for compositor compatibility
      const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
      const { PutCommand, DynamoDBDocumentClient } = await import(
        "@aws-sdk/lib-dynamodb"
      );

      const client = new DynamoDBClient({});
      const docClient = DynamoDBDocumentClient.from(client);

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

      console.log(`Import complete: ${storeResult.written} new records, ${storeResult.duplicates} duplicates`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          importId,
          recordsParsed: parseResult.records.length,
          recordsWritten: storeResult.written,
          recordsDuplicate: storeResult.duplicates,
          counts: parseResult.counts,
        }),
      };
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      console.error("Failed to parse/store CSV files:", errorMessage);
      // Fall through to return success with legacy data only
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          legacyOnly: true,
          treatmentCount: result.treatments.length,
          error: errorMessage,
        }),
      };
    }
  } else if (result.success) {
    // Legacy fallback: scraper succeeded but no CSV files (shouldn't happen)
    console.warn("Scraper succeeded but no CSV files returned");
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        legacyOnly: true,
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
