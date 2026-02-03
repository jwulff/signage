/**
 * @diabetes/core - Storage
 *
 * DynamoDB storage layer for diabetes data
 */

// Client
export { createDocClient } from "./client.js";

// Key generation
export {
  DATA_TIMEZONE,
  formatDateInTimezone,
  getStartOfDayInTimezone,
  generateRecordHash,
  generateRecordKeys,
  generateAggregationKeys,
  generateInsightKeys,
  type RecordKeys,
} from "./keys.js";

// Record operations
export {
  storeRecords,
  queryByTypeAndDateRange,
  queryByTypeAndTimeRange,
  queryDailyInsulinByDateRange,
  queryAllTypesByTimeRange,
  type WriteResult,
  type RecordItem,
} from "./records.js";

// Insight operations
export {
  storeInsight,
  getCurrentInsight,
  getInsightHistory,
  updateCurrentInsightReasoning,
  isInsightStale,
  getInsightStatus,
} from "./insights.js";

// Aggregation operations
export {
  storeDailyAggregation,
  getDailyAggregation,
  getDailyAggregations,
  storeWeeklyAggregation,
  getWeeklyAggregation,
  type DailyAggregation,
  type WeeklyAggregation,
} from "./aggregations.js";
