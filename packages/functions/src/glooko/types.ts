/**
 * Glooko integration types for diabetes treatment data
 */

/**
 * A single treatment event from Glooko (insulin or carbs)
 */
export interface GlookoTreatment {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Type of treatment */
  type: "insulin" | "carbs";
  /** Value: units for insulin, grams for carbs */
  value: number;
  /** Optional source device/app */
  source?: string;
}

/**
 * Display data for treatments widget
 */
export interface TreatmentDisplayData {
  /** Total insulin units in last 4 hours */
  recentInsulinUnits: number;
  /** Total carb grams in last 4 hours */
  recentCarbsGrams: number;
  /** Individual treatment events for chart overlay */
  treatments: GlookoTreatment[];
  /** Unix timestamp when data was last fetched */
  lastFetchedAt: number;
  /** True if data is older than 6 hours */
  isStale: boolean;
  /** Daily insulin totals from Glooko (includes basal + bolus), keyed by date string YYYY-MM-DD */
  dailyInsulinTotals?: Record<string, number>;
}

/**
 * Raw CSV row from Glooko export
 */
export interface GlookoCsvRow {
  timestamp: string;
  insulinUnits?: string;
  carbGrams?: string;
  source?: string;
  [key: string]: string | undefined;
}

/**
 * Scraper configuration
 */
export interface GlookoScraperConfig {
  email: string;
  password: string;
  /** Number of days to export (default: 1) */
  exportDays?: number;
}

/**
 * Extracted CSV file from Glooko export
 */
export interface ExtractedCsv {
  fileName: string;
  content: string;
}

/**
 * Scraper result
 */
export interface GlookoScraperResult {
  success: boolean;
  treatments: GlookoTreatment[];
  /** Raw CSV files from export (for new parsing pipeline) */
  csvFiles?: ExtractedCsv[];
  error?: string;
  /** Timestamp when scrape completed */
  scrapedAt: number;
}

/**
 * DynamoDB item for cached treatment data
 * pk: GLOOKO#TREATMENTS
 * sk: DATA
 */
export interface GlookoTreatmentsItem {
  pk: string;
  sk: string;
  treatments: GlookoTreatment[];
  lastFetchedAt: number;
  ttl?: number;
}

/**
 * DynamoDB item for scraper state
 * pk: GLOOKO#SCRAPER
 * sk: STATE
 */
export interface GlookoScraperState {
  pk: string;
  sk: string;
  lastRunAt: number;
  lastSuccessAt?: number;
  consecutiveFailures: number;
  lastError?: string;
}
