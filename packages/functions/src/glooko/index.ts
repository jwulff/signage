/**
 * Glooko integration module
 *
 * @deprecated Use @diabetes/core directly instead. This module re-exports
 * for backward compatibility and will be removed in a future version.
 */

// Re-export types from @diabetes/core for backward compatibility
export type {
  CgmReading,
  BgReading,
  BolusRecord,
  BasalRecord,
  DailyInsulinSummary,
  AlarmRecord,
  CarbsRecord,
  FoodRecord,
  ExerciseRecord,
  MedicationRecord,
  ManualInsulinRecord,
  NoteRecord,
  DiabetesRecord,
  DiabetesRecordType,
  BolusType,
  ExerciseIntensity,
} from "@diabetes/core";

// Also export as the old GlookoRecord name for compatibility
export type { DiabetesRecord as GlookoRecord } from "@diabetes/core";
export type { DiabetesRecordType as GlookoRecordType } from "@diabetes/core";

// Re-export storage functions
export {
  generateRecordKeys,
  storeRecords,
  queryByTypeAndTimeRange,
  queryDailyInsulinByDateRange,
  createDocClient,
} from "@diabetes/core";

// Re-export parser
export { parseGlookoExport, type ExtractedCsv, type ParseResult } from "@diabetes/core";

// Re-export from local types (scraper-specific types)
export * from "./types.js";

// Re-export scraper
export * from "./scraper.js";
