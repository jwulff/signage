/**
 * Glooko CSV parser
 *
 * Parses all CSV file types from Glooko exports into strongly-typed records.
 */

import type {
  DiabetesRecord,
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
} from "../models/index.js";
import {
  parseCsvLine,
  findHeaderAndDataStart,
  parseTimestamp,
  parseFloat0,
  createColumnMap,
  getColumn,
  formatDateInExportTimezone,
} from "./csv-utils.js";
import {
  isValidGlucose,
  isValidInsulinBolus,
  isValidBasalRate,
  isValidCarbs,
} from "./validation.js";

/**
 * Extracted CSV file from Glooko export
 */
export interface ExtractedCsv {
  fileName: string;
  content: string;
}

/**
 * Parse result
 */
export interface ParseResult {
  records: DiabetesRecord[];
  errors: string[];
  counts: Partial<Record<DiabetesRecord["type"], number>>;
}

// Individual file type parsers
function parseCgmCsv(content: string, fileName: string, importedAt: number): CgmReading[] {
  const records: CgmReading[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const glucose = parseFloat0(getColumn(row, colMap, "cgmglucosevaluemgdl", "glucosevalue", "glucose"));
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

function parseBgCsv(content: string, fileName: string, importedAt: number): BgReading[] {
  const records: BgReading[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const glucose = parseFloat0(getColumn(row, colMap, "glucosevaluemgdl", "glucosevalue", "glucose"));
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

function parseBolusCsv(content: string, fileName: string, importedAt: number): BolusRecord[] {
  const records: BolusRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const insulinDelivered = parseFloat0(getColumn(row, colMap, "insulindeliveredu", "insulindelivered", "delivered"));
    const carbsInput = parseFloat0(getColumn(row, colMap, "carbsinputg", "carbsinput", "carbs"));

    const validInsulin = insulinDelivered > 0 && isValidInsulinBolus(insulinDelivered);
    const validCarbs = carbsInput > 0 && isValidCarbs(carbsInput);
    if (!validInsulin && !validCarbs) continue;

    const bolusTypeStr = getColumn(row, colMap, "insulintype", "bolustype", "type");
    let bolusType: BolusType = "Normal";
    if (bolusTypeStr.toLowerCase().includes("extend")) bolusType = "Extended";
    else if (bolusTypeStr.toLowerCase().includes("combo")) bolusType = "Combo";

    const bgInput = parseFloat0(getColumn(row, colMap, "bloodglucoseinputmgdl", "bginput", "glucose"));

    records.push({
      type: "bolus",
      timestamp,
      bolusType,
      bgInputMgDl: isValidGlucose(bgInput) ? bgInput : 0,
      carbsInputGrams: validCarbs ? carbsInput : 0,
      carbRatio: parseFloat0(getColumn(row, colMap, "carbsratio", "ratio")),
      insulinDeliveredUnits: validInsulin ? insulinDelivered : 0,
      initialDeliveryUnits: parseFloat0(getColumn(row, colMap, "initialdeliveryu", "initialdelivery")) || undefined,
      extendedDeliveryUnits: parseFloat0(getColumn(row, colMap, "extendeddeliveryu", "extendeddelivery")) || undefined,
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

function parseBasalCsv(content: string, fileName: string, importedAt: number): BasalRecord[] {
  const records: BasalRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const rate = parseFloat0(getColumn(row, colMap, "rate"));
    if (rate > 0 && !isValidBasalRate(rate)) continue;

    const insulinDelivered = parseFloat0(getColumn(row, colMap, "insulindeliveredu", "delivered"));

    records.push({
      type: "basal",
      timestamp,
      basalType: getColumn(row, colMap, "insulintype", "basaltype", "type") || "Scheduled",
      durationMinutes: parseFloat0(getColumn(row, colMap, "durationminutes", "duration")),
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

function parseInsulinSummaryCsv(content: string, fileName: string, importedAt: number): DailyInsulinSummary[] {
  const records: DailyInsulinSummary[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const dateStr = formatDateInExportTimezone(timestamp);

    records.push({
      type: "daily_insulin",
      timestamp,
      date: dateStr,
      totalBolusUnits: parseFloat0(getColumn(row, colMap, "totalbolusu", "totalbolus", "bolus")),
      totalBasalUnits: parseFloat0(getColumn(row, colMap, "totalbasalu", "totalbasal", "basal")),
      totalInsulinUnits: parseFloat0(getColumn(row, colMap, "totalinsulinu", "totalinsulin", "total")),
      deviceSerial: getColumn(row, colMap, "serialnumber") || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

function parseAlarmsCsv(content: string, fileName: string, importedAt: number): AlarmRecord[] {
  const records: AlarmRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
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

function parseCarbsCsv(content: string, fileName: string, importedAt: number): CarbsRecord[] {
  const records: CarbsRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const carbs = parseFloat0(getColumn(row, colMap, "carbsg", "carbs"));
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

function parseFoodCsv(content: string, fileName: string, importedAt: number): FoodRecord[] {
  const records: FoodRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const name = getColumn(row, colMap, "name", "food", "description");
    if (!name) continue;

    const foodCarbs = parseFloat0(getColumn(row, colMap, "carbsg", "carbs"));

    records.push({
      type: "food",
      timestamp,
      name,
      carbsGrams: foodCarbs > 0 && isValidCarbs(foodCarbs) ? foodCarbs : undefined,
      fatGrams: parseFloat0(getColumn(row, colMap, "fat")) || undefined,
      proteinGrams: parseFloat0(getColumn(row, colMap, "protein")) || undefined,
      calories: parseFloat0(getColumn(row, colMap, "calories")) || undefined,
      servingQuantity: parseFloat0(getColumn(row, colMap, "servingquantity", "serving")) || undefined,
      numberOfServings: parseFloat0(getColumn(row, colMap, "numberofservings", "servings")) || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

function parseExerciseCsv(content: string, fileName: string, importedAt: number): ExerciseRecord[] {
  const records: ExerciseRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
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
      durationMinutes: parseFloat0(getColumn(row, colMap, "durationminutes", "duration")) || undefined,
      caloriesBurned: parseFloat0(getColumn(row, colMap, "caloriesburned", "calories")) || undefined,
      sourceFile: fileName,
      importedAt,
    });
  }

  return records;
}

function parseMedicationCsv(content: string, fileName: string, importedAt: number): MedicationRecord[] {
  const records: MedicationRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
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

function parseManualInsulinCsv(content: string, fileName: string, importedAt: number): ManualInsulinRecord[] {
  const records: ManualInsulinRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
    if (!timestamp) continue;

    const units = parseFloat0(getColumn(row, colMap, "value", "units", "dose"));
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

function parseNotesCsv(content: string, fileName: string, importedAt: number): NoteRecord[] {
  const records: NoteRecord[] = [];
  const lines = content.trim().split("\n");
  const { headerIdx, dataStartIdx } = findHeaderAndDataStart(lines);
  if (lines.length <= dataStartIdx) return records;

  const header = parseCsvLine(lines[headerIdx]);
  const colMap = createColumnMap(header);

  for (let i = dataStartIdx; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const timestamp = parseTimestamp(getColumn(row, colMap, "timestamp", "datetime", "time"));
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

/**
 * Determine file type from filename
 */
function getFileType(fileName: string): DiabetesRecord["type"] | "unknown" {
  const lower = fileName.toLowerCase();

  if (lower.includes("cgm_data") || lower.includes("cgm-data")) return "cgm";
  if (lower.includes("bg_data") || lower.includes("bg-data")) return "bg";
  if (lower.includes("bolus_data") || lower.includes("bolus-data")) return "bolus";
  if (lower.includes("basal_data") || lower.includes("basal-data")) return "basal";
  if (
    (lower.includes("insulin_data") || lower.includes("insulin-data")) &&
    !lower.includes("bolus") &&
    !lower.includes("basal") &&
    !lower.includes("manual")
  ) {
    return "daily_insulin";
  }
  if (lower.includes("alarms_data") || lower.includes("alarm")) return "alarm";
  if (lower.includes("carbs_data") || lower.includes("carbs-data")) return "carbs";
  if (lower.includes("food_data") || lower.includes("food-data")) return "food";
  if (lower.includes("exercise_data") || lower.includes("exercise-data")) return "exercise";
  if (lower.includes("medication_data") || lower.includes("medication-data")) return "medication";
  if (
    lower.includes("manual_insulin") ||
    lower.includes("manual-insulin") ||
    lower.includes("manualinsulin")
  ) {
    return "manual_insulin";
  }
  if (lower.includes("notes_data") || lower.includes("notes-data")) return "note";

  return "unknown";
}

/**
 * Parse all CSV files from a Glooko export
 */
export function parseGlookoExport(csvFiles: ExtractedCsv[]): ParseResult {
  const importedAt = Date.now();
  const records: DiabetesRecord[] = [];
  const errors: string[] = [];
  const counts: Partial<Record<DiabetesRecord["type"], number>> = {};

  for (const { fileName, content } of csvFiles) {
    const fileType = getFileType(fileName);

    if (fileType === "unknown") continue;

    try {
      let parsed: DiabetesRecord[] = [];

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
      }
    } catch (error) {
      const errorMsg = `Error parsing ${fileName}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
    }
  }

  return { records, errors, counts };
}
