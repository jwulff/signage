/**
 * Widget framework types
 */

/**
 * Interface for widget updaters.
 * Each widget must implement this interface to be registered.
 */
export interface WidgetUpdater {
  /** Unique widget identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** EventBridge rate expression (e.g., "rate(1 minute)") */
  schedule: string;
  /**
   * Fetch/compute the widget's current data.
   * @param config Optional configuration for the widget
   * @returns The widget data to broadcast
   */
  update(config?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Registry mapping widget IDs to their updaters.
 */
export type WidgetRegistry = Record<string, WidgetUpdater>;

/**
 * Widget update message sent to clients.
 */
export interface WidgetUpdateMessage {
  type: "widget-update";
  widgetId: string;
  data: unknown;
  timestamp: number;
}

/**
 * Widget state stored in DynamoDB.
 */
export interface WidgetState {
  pk: string; // WIDGET#{widgetId}
  sk: "STATE";
  widgetId: string;
  lastRun: string;
  lastData: unknown;
  errorCount: number;
  lastError?: string;
}

/**
 * Configuration for widget history/time-series storage.
 */
export interface WidgetHistoryConfig {
  /** Whether history storage is enabled for this widget */
  enabled: boolean;
  /** How long to keep data points in hours (e.g., 24 for blood sugar) */
  retentionHours: number;
  /** How far back to fetch when backfilling in hours */
  backfillDepthHours: number;
  /** Gap size in minutes that triggers a backfill */
  backfillThresholdMinutes: number;
  /** Window in minutes to prevent duplicate points */
  dedupeWindowMinutes: number;
  /** Type of storage pattern */
  storageType: "time-series" | "content-cache";
}

/**
 * A single time-series data point.
 */
export interface TimeSeriesPoint<T = unknown> {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** The data value for this point */
  value: T;
  /** Optional metadata for the point */
  meta?: Record<string, unknown>;
}

/**
 * Extended widget updater interface with history support.
 */
export interface WidgetUpdaterWithHistory extends WidgetUpdater {
  /** Configuration for history storage */
  historyConfig?: WidgetHistoryConfig;
  /**
   * Fetch historical data points for backfill.
   * @param since Start timestamp in milliseconds
   * @param until End timestamp in milliseconds
   * @returns Array of time-series points
   */
  fetchHistory?(since: number, until: number): Promise<TimeSeriesPoint[]>;
}

/**
 * History metadata stored in DynamoDB for tracking backfill state.
 */
export interface WidgetHistoryMeta {
  pk: string; // WIDGET#{widgetId}#HISTORY
  sk: "META";
  widgetId: string;
  lastDataPointAt: number;
  lastBackfillAt?: number;
  totalPointsStored?: number;
}
