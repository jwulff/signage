/**
 * Glooko CSV Parser
 *
 * Parses all CSV file types from Glooko exports into strongly-typed records.
 * Handles the metadata header row and various date formats.
 */

import type {
  GlookoRecord,
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
  BolusType,
  ExerciseIntensity,
} from "./data-model.js";

// =============================================================================
// Types
// =============================================================================

export interface ExtractedCsv {
  fileName: string;
  content: string;
}

export interface ParseResult {
  records: GlookoRecord[];
  errors: string[];
  counts: Partial<Record<GlookoRecord["type"], number>>;
}

// =============================================================================
// Medical Value Validation
// =============================================================================

/**
 * Physiological limits for medical values.
 * Values outside these ranges are rejected as data errors.
 */
const VALIDATION = {
  // Glucose values (mg/dL)
  // CGM range is typically 40-400, but we allow wider for finger sticks
  GLUCOSE_MIN: 20,    // Below this is device error
  GLUCOSE_MAX: 600,   // Above this is device error

  // Insulin values (units)
  INSULIN_BOLUS_MAX: 100,  // Max reasonable bolus (typical max is 25-50u)
  INSULIN_BASAL_RATE_MAX: 10,  // Max basal rate u/hr (typical max is 2-5u/hr)

  // Carbs (grams)
  CARBS_MAX: 500,  // Max reasonable meal (typical is 30-100g)
} as const;

/**
 * Validate glucose value is within physiological range
 */
function isValidGlucose(value: number): boolean {
  return value >= VALIDATION.GLUCOSE_MIN && value <= VALIDATION.GLUCOSE_MAX;
}

/**
 * Validate insulin bolus is within reasonable range
 */
function isValidInsulinBolus(value: number): boolean {
  return value > 0 && value <= VALIDATION.INSULIN_BOLUS_MAX;
}

/**
 * Validate basal rate is within reasonable range
 */
function isValidBasalRate(value: number): boolean {
  return value >= 0 && value <= VALIDATION.INSULIN_BASAL_RATE_MAX;
}

/**
 * Validate carbs value is within reasonable range
 */
function isValidCarbs(value: number): boolean {
  return value > 0 && value <= VALIDATION.CARBS_MAX;
}

// =============================================================================
// CSV Utilities
// =============================================================================

/**
 * Parse a CSV line, handling quoted values
 */
function parseCsvLine(line: string): string[] {
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
 * Find header row (skip metadata row if present)
 */
function findHeaderAndDataStart(
  lines: string[]
): { headerIdx: number; dataStartIdx: number } {
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    // Glooko CSVs have metadata in first row
    if (
      firstLine.includes("medical record") ||
      firstLine.includes("name:") ||
      firstLine.includes("date range")
    ) {
      return { headerIdx: 1, dataStartIdx: 2 };
    }
  }
  return { headerIdx: 0, dataStartIdx: 1 };
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
  timezone: string
): number {
  // Create a Date in UTC with these components as a starting guess
  const utcGuess = Date.UTC(year, month, day, hour, minute);

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
 * Parse timestamp string into Unix milliseconds.
 * Glooko exports timestamps in the user's local timezone (America/Los_Angeles),
 * so we parse them in that timezone to get correct UTC milliseconds.
 */
function parseTimestamp(value: string): number | null {
  if (!value || value === "0") return null;

  // Try ISO format first (already includes timezone info)
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }

  // Try "YYYY-MM-DD HH:MM" format (common in Glooko)
  const glookoFormat = value.match(
    /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/
  );
  if (glookoFormat) {
    const [, year, month, day, hour, minute] = glookoFormat;
    const timestamp = parseLocalDateTime(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      GLOOKO_EXPORT_TIMEZONE
    );
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }

  // Try US format MM/DD/YYYY HH:MM
  const usFormat = value.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/
  );
  if (usFormat) {
    const [, month, day, year, hour, minute] = usFormat;
    const timestamp = parseLocalDateTime(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      GLOOKO_EXPORT_TIMEZONE
    );
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }

  return null;
}

/**
 * Parse a float, returning 0 for empty/invalid values
 */
function parseFloat0(value: string): number {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Create column index map from header
 */
function createColumnMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((col, idx) => {
    // Normalize: lowercase, remove special chars
    const normalized = col.toLowerCase().replace(/[^a-z0-9]/g, "");
    map.set(normalized, idx);
  });
  return map;
}

/**
 * Get column value by possible names
 */
function getColumn(
  row: string[],
  colMap: Map<string, number>,
  ...names: string[]
): string {
  for (const name of names) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idx = colMap.get(normalized);
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx];
    }
  }
  return "";
}

// =============================================================================
// File Type Parsers
// =============================================================================

/**
 * Parse CGM data CSV
 */
function parseCgmCsv(
  content: string,
  fileName: string,
  importedAt: number
): CgmReading[] {
  const records: CgmReading[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const glucose = parseFloat0(
      getColumn(row, colMap, "cgmglucosevaluemgdl", "glucosevalue", "glucose")
    );
    // Validate glucose is within physiological range
    if (!isValidGlucose(glucose)) continue;

    records.push({
      type: "cgm",
      timestamp,
      glucoseMgDl: glucose,
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse BG (finger stick) data CSV
 */
function parseBgCsv(
  content: string,
  fileName: string,
  importedAt: number
): BgReading[] {
  const records: BgReading[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const glucose = parseFloat0(
      getColumn(row, colMap, "glucosevaluemgdl", "glucosevalue", "glucose")
    );
    // Validate glucose is within physiological range
    if (!isValidGlucose(glucose)) continue;

    const manualFlag = getColumn(row, colMap, "manualreading", "manual");

    records.push({
      type: "bg",
      timestamp,
      glucoseMgDl: glucose,
      isManual: manualFlag.toUpperCase() === "M" || manualFlag === "true",
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse bolus data CSV
 */
function parseBolusCsv(
  content: string,
  fileName: string,
  importedAt: number
): BolusRecord[] {
  const records: BolusRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const insulinDelivered = parseFloat0(
      getColumn(row, colMap, "insulindeliveredu", "insulindelivered", "delivered")
    );
    // Allow 0 insulin if there are carbs
    const carbsInput = parseFloat0(
      getColumn(row, colMap, "carbsinputg", "carbsinput", "carbs")
    );

    // Validate insulin and carbs are within reasonable ranges
    const validInsulin = insulinDelivered > 0 && isValidInsulinBolus(insulinDelivered);
    const validCarbs = carbsInput > 0 && isValidCarbs(carbsInput);
    if (!validInsulin && !validCarbs) continue;

    const bolusTypeStr = getColumn(row, colMap, "insulintype", "bolustype", "type");
    let bolusType: BolusType = "Normal";
    if (bolusTypeStr.toLowerCase().includes("extend")) {
      bolusType = "Extended";
    } else if (bolusTypeStr.toLowerCase().includes("combo")) {
      bolusType = "Combo";
    }

    const bgInput = parseFloat0(
      getColumn(row, colMap, "bloodglucoseinputmgdl", "bginput", "glucose")
    );

    records.push({
      type: "bolus",
      timestamp,
      bolusType,
      bgInputMgDl: isValidGlucose(bgInput) ? bgInput : 0,
      carbsInputGrams: validCarbs ? carbsInput : 0,
      carbRatio: parseFloat0(getColumn(row, colMap, "carbsratio", "ratio")),
      insulinDeliveredUnits: validInsulin ? insulinDelivered : 0,
      initialDeliveryUnits:
        parseFloat0(getColumn(row, colMap, "initialdeliveryu", "initialdelivery")) ||
        undefined,
      extendedDeliveryUnits:
        parseFloat0(getColumn(row, colMap, "extendeddeliveryu", "extendeddelivery")) ||
        undefined,
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse basal data CSV
 */
function parseBasalCsv(
  content: string,
  fileName: string,
  importedAt: number
): BasalRecord[] {
  const records: BasalRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const rate = parseFloat0(getColumn(row, colMap, "rate"));
    const insulinDelivered = parseFloat0(getColumn(row, colMap, "insulindeliveredu", "delivered"));

    // Validate basal rate is within reasonable range
    if (rate > 0 && !isValidBasalRate(rate)) continue;

    records.push({
      type: "basal",
      timestamp,
      basalType: getColumn(row, colMap, "insulintype", "basaltype", "type") || "Scheduled",
      durationMinutes: parseFloat0(
        getColumn(row, colMap, "durationminutes", "duration")
      ),
      percentage: parseFloat0(getColumn(row, colMap, "percentage")) || undefined,
      rate: rate || undefined,
      insulinDeliveredUnits: insulinDelivered || undefined,
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse daily insulin summary CSV
 */
function parseInsulinSummaryCsv(
  content: string,
  fileName: string,
  importedAt: number
): DailyInsulinSummary[] {
  const records: DailyInsulinSummary[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const date = new Date(timestamp);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    records.push({
      type: "daily_insulin",
      timestamp,
      date: dateStr,
      totalBolusUnits: parseFloat0(
        getColumn(row, colMap, "totalbolusu", "totalbolus", "bolus")
      ),
      totalBasalUnits: parseFloat0(
        getColumn(row, colMap, "totalbasalu", "totalbasal", "basal")
      ),
      totalInsulinUnits: parseFloat0(
        getColumn(row, colMap, "totalinsulinu", "totalinsulin", "total")
      ),
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse alarms CSV
 */
function parseAlarmsCsv(
  content: string,
  fileName: string,
  importedAt: number
): AlarmRecord[] {
  const records: AlarmRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const event = getColumn(row, colMap, "alarmevent", "alarm", "event");
    if (!event) continue;

    records.push({
      type: "alarm",
      timestamp,
      event,
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse standalone carbs CSV
 */
function parseCarbsCsv(
  content: string,
  fileName: string,
  importedAt: number
): CarbsRecord[] {
  const records: CarbsRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const carbs = parseFloat0(getColumn(row, colMap, "carbsg", "carbs"));
    // Validate carbs are within reasonable range
    if (!isValidCarbs(carbs)) continue;

    records.push({
      type: "carbs",
      timestamp,
      carbsGrams: carbs,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse food log CSV
 */
function parseFoodCsv(
  content: string,
  fileName: string,
  importedAt: number
): FoodRecord[] {
  const records: FoodRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const name = getColumn(row, colMap, "name", "food", "description");
    if (!name) continue;

    const foodCarbs = parseFloat0(getColumn(row, colMap, "carbsg", "carbs"));

    records.push({
      type: "food",
      timestamp,
      name,
      // Only include carbs if within valid range
      carbsGrams: (foodCarbs > 0 && isValidCarbs(foodCarbs)) ? foodCarbs : undefined,
      fatGrams: parseFloat0(getColumn(row, colMap, "fat")) || undefined,
      proteinGrams: parseFloat0(getColumn(row, colMap, "protein")) || undefined,
      calories: parseFloat0(getColumn(row, colMap, "calories")) || undefined,
      servingQuantity:
        parseFloat0(getColumn(row, colMap, "servingquantity", "serving")) || undefined,
      numberOfServings:
        parseFloat0(getColumn(row, colMap, "numberofservings", "servings")) || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse exercise CSV
 */
function parseExerciseCsv(
  content: string,
  fileName: string,
  importedAt: number
): ExerciseRecord[] {
  const records: ExerciseRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const name = getColumn(row, colMap, "name", "exercise", "activity");
    if (!name) continue;

    const intensityStr = getColumn(row, colMap, "intensity");
    let intensity: ExerciseIntensity | undefined;
    if (intensityStr) {
      const lower = intensityStr.toLowerCase();
      if (lower.includes("low")) intensity = "Low";
      else if (lower.includes("high")) intensity = "High";
      else if (lower.includes("med")) intensity = "Medium";
      else intensity = "Other";
    }

    records.push({
      type: "exercise",
      timestamp,
      name,
      intensity,
      durationMinutes:
        parseFloat0(getColumn(row, colMap, "durationminutes", "duration")) || undefined,
      caloriesBurned:
        parseFloat0(getColumn(row, colMap, "caloriesburned", "calories")) || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse medication CSV
 */
function parseMedicationCsv(
  content: string,
  fileName: string,
  importedAt: number
): MedicationRecord[] {
  const records: MedicationRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const name = getColumn(row, colMap, "name", "medication");
    if (!name) continue;

    records.push({
      type: "medication",
      timestamp,
      name,
      value: parseFloat0(getColumn(row, colMap, "value", "dose")) || undefined,
      medicationType: getColumn(row, colMap, "medicationtype", "type") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse manual insulin CSV
 */
function parseManualInsulinCsv(
  content: string,
  fileName: string,
  importedAt: number
): ManualInsulinRecord[] {
  const records: ManualInsulinRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const units = parseFloat0(getColumn(row, colMap, "value", "units", "dose"));
    // Validate insulin is within reasonable range
    if (!isValidInsulinBolus(units)) continue;

    records.push({
      type: "manual_insulin",
      timestamp,
      units,
      name: getColumn(row, colMap, "name", "insulin") || undefined,
      insulinType: getColumn(row, colMap, "insulintype", "type") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

/**
 * Parse notes CSV
 */
function parseNotesCsv(
  content: string,
  fileName: string,
  importedAt: number
): NoteRecord[] {
  const records: NoteRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);

  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(
      getColumn(row, colMap, "timestamp", "datetime", "time")
    );
    if (!timestamp) continue;

    const text = getColumn(row, colMap, "value", "note", "text");
    if (!text) continue;

    records.push({
      type: "note",
      timestamp,
      text,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Determine file type from filename
 */
function getFileType(
  fileName: string
): GlookoRecord["type"] | "unknown" {
  const lower = fileName.toLowerCase();

  if (lower.includes("cgm_data") || lower.includes("cgm-data")) {
    return "cgm";
  }
  if (lower.includes("bg_data") || lower.includes("bg-data")) {
    return "bg";
  }
  if (lower.includes("bolus_data") || lower.includes("bolus-data")) {
    return "bolus";
  }
  if (lower.includes("basal_data") || lower.includes("basal-data")) {
    return "basal";
  }
  if (
    (lower.includes("insulin_data") || lower.includes("insulin-data")) &&
    !lower.includes("bolus") &&
    !lower.includes("basal") &&
    !lower.includes("manual")
  ) {
    return "daily_insulin";
  }
  if (lower.includes("alarms_data") || lower.includes("alarm")) {
    return "alarm";
  }
  if (lower.includes("carbs_data") || lower.includes("carbs-data")) {
    return "carbs";
  }
  if (lower.includes("food_data") || lower.includes("food-data")) {
    return "food";
  }
  if (lower.includes("exercise_data") || lower.includes("exercise-data")) {
    return "exercise";
  }
  if (lower.includes("medication_data") || lower.includes("medication-data")) {
    return "medication";
  }
  if (
    lower.includes("manual_insulin") ||
    lower.includes("manual-insulin") ||
    lower.includes("manualinsulin")
  ) {
    return "manual_insulin";
  }
  if (lower.includes("notes_data") || lower.includes("notes-data")) {
    return "note";
  }

  return "unknown";
}

/**
 * Parse all CSV files from a Glooko export
 */
export function parseGlookoExport(csvFiles: ExtractedCsv[]): ParseResult {
  const importedAt = Date.now();
  const records: GlookoRecord[] = [];
  const errors: string[] = [];
  const counts: Partial<Record<GlookoRecord["type"], number>> = {};

  for (const { fileName, content } of csvFiles) {
    const fileType = getFileType(fileName);

    if (fileType === "unknown") {
      // Skip unknown files silently (might be summary files, etc.)
      continue;
    }

    try {
      let parsed: GlookoRecord[] = [];

      switch (fileType) {
        case "cgm":
          parsed = parseCgmCsv(content, fileName, importedAt);
          break;
        case "bg":
          parsed = parseBgCsv(content, fileName, importedAt);
          break;
        case "bolus":
          parsed = parseBolusCsv(content, fileName, importedAt);
          break;
        case "basal":
          parsed = parseBasalCsv(content, fileName, importedAt);
          break;
        case "daily_insulin":
          parsed = parseInsulinSummaryCsv(content, fileName, importedAt);
          break;
        case "alarm":
          parsed = parseAlarmsCsv(content, fileName, importedAt);
          break;
        case "carbs":
          parsed = parseCarbsCsv(content, fileName, importedAt);
          break;
        case "food":
          parsed = parseFoodCsv(content, fileName, importedAt);
          break;
        case "exercise":
          parsed = parseExerciseCsv(content, fileName, importedAt);
          break;
        case "medication":
          parsed = parseMedicationCsv(content, fileName, importedAt);
          break;
        case "manual_insulin":
          parsed = parseManualInsulinCsv(content, fileName, importedAt);
          break;
        case "note":
          parsed = parseNotesCsv(content, fileName, importedAt);
          break;
      }

      if (parsed.length > 0) {
        records.push(...parsed);
        counts[fileType] = (counts[fileType] || 0) + parsed.length;
        console.log(`Parsed ${parsed.length} ${fileType} records from ${fileName}`);
      }
    } catch (error) {
      const errorMsg = `Error parsing ${fileName}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  console.log(`Total: ${records.length} records parsed from ${csvFiles.length} files`);

  return { records, errors, counts };
}
