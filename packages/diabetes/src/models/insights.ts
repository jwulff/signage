/**
 * AI-generated insight types for the diabetes analyst agent
 */

/**
 * Type of analysis that generated the insight
 */
export type InsightType = "hourly" | "daily" | "weekly" | "alert";

/**
 * An AI-generated insight about diabetes data
 */
export interface Insight {
  /** The insight text (max 80 chars for display) */
  content: string;
  /** Type of analysis that generated this insight */
  type: InsightType;
  /** When this insight was generated (Unix ms) */
  generatedAt: number;
  /** Supporting metrics that led to this insight */
  metrics?: InsightMetrics;
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
