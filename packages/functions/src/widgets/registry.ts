/**
 * Widget registry
 * Maps widget IDs to their updater implementations.
 */

import type { WidgetRegistry } from "./types";
import { clockUpdater } from "./updaters/clock";

/**
 * Registry of all available widgets.
 * Add new widgets here as they are implemented.
 */
export const widgetRegistry: WidgetRegistry = {
  [clockUpdater.id]: clockUpdater,
};

/**
 * Get a widget updater by ID.
 * @param widgetId The widget identifier
 * @returns The widget updater or undefined if not found
 */
export function getWidget(widgetId: string) {
  return widgetRegistry[widgetId];
}

/**
 * Get all registered widget IDs.
 */
export function getWidgetIds(): string[] {
  return Object.keys(widgetRegistry);
}
