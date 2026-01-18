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
