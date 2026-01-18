/**
 * Clock Widget Updater
 * Provides current time and date data.
 */

import type { WidgetUpdater } from "../types";

export interface ClockData {
  time: string;
  date: string;
  hour: number;
  minute: number;
  second: number;
  timestamp: number;
}

export const clockUpdater: WidgetUpdater = {
  id: "clock",
  name: "Clock Widget",
  schedule: "rate(1 minute)",

  async update(): Promise<ClockData> {
    const now = new Date();

    return {
      time: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      date: now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
      timestamp: now.getTime(),
    };
  },
};
