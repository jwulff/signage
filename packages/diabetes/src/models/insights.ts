/**
 * AI-generated insight types for the diabetes analyst agent
 */

/**
 * Type of analysis that generated the insight
 */
export type InsightType = "hourly" | "daily" | "weekly" | "alert";

/**
 * Glucose zone for trigger evaluation
 */
export type InsightZone = "low" | "caution" | "in-range" | "high";

/**
 * An AI-generated insight about diabetes data
 */
export interface Insight {
  /** The insight text (hourly LED insights: max 30 chars; daily/weekly may be longer) */
  content: string;
  /** Type of analysis that generated this insight */
  type: InsightType;
  /** When this insight was generated (Unix ms) */
  generatedAt: number;
  /** Supporting metrics that led to this insight */
  metrics?: InsightMetrics;
  /** Agent's reasoning for generating this insight (for prompt refinement) */
  reasoning?: string;
  /** Glucose value (mg/dL) when this insight was generated, for drift detection */
  glucoseAtGeneration?: number;
  /** Glucose zone when this insight was generated, for zone-change detection */
  zoneAtGeneration?: InsightZone;
}

/**
 * Metrics captured with an insight for analysis
 */
export interface InsightMetrics {
  /** Time in range percentage */
  tir?: number;
  /** Average glucose in mg/dL */
  avgGlucose?: number;
  /** Total insulin for period */
  insulinTotal?: number;
  /** Glucose variability (coefficient of variation) */
  cv?: number;
  /** Recent trend direction */
  trend?: "rising" | "falling" | "stable";
  /** Number of low events */
  lowEvents?: number;
  /** Number of high events */
  highEvents?: number;
  /** Additional metrics as needed */
  [key: string]: number | string | undefined;
}

/**
 * Stored insight with full metadata
 */
export interface StoredInsight extends Insight {
  /** User ID this insight belongs to */
  userId: string;
  /** Unique insight ID */
  insightId: string;
  /** When this insight expires (for cache invalidation) */
  expiresAt?: number;
}
