/**
 * CSV parsing utilities
 */

/**
 * The timezone that Glooko exports data in
 */
export const GLOOKO_EXPORT_TIMEZONE = "America/Los_Angeles";

/**
 * Parse a CSV line, handling quoted values
 */
export function parseCsvLine(line: string): string[] {
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
export function findHeaderAndDataStart(
  lines: string[]
): { headerIdx: number; dataStartIdx: number } {
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
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
 * Parse a naive datetime as if it's in the specified timezone
 */
export function parseLocalDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): number {
  const utcGuess = Date.UTC(year, month, day, hour, minute, second);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(utcGuess));
  const localHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
  const localMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
  const localDay = parseInt(parts.find((p) => p.type === "day")?.value || "0");
  const localMonth = parseInt(parts.find((p) => p.type === "month")?.value || "0") - 1;
  const localYear = parseInt(parts.find((p) => p.type === "year")?.value || "0");

  const localAsUtc = Date.UTC(localYear, localMonth, localDay, localHour, localMinute);
  const offsetMs = utcGuess - localAsUtc;

  return utcGuess + offsetMs;
}

/**
 * Parse timestamp string into Unix milliseconds
 */
export function parseTimestamp(value: string): number | null {
  if (!value || value === "0") return null;

  // Check for explicit timezone info
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // Try "YYYY-MM-DD HH:MM[:SS]" format
  const glookoFormat = value.match(
    /(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (glookoFormat) {
    const [, year, month, day, hour, minute, second = "0"] = glookoFormat;
    const timestamp = parseLocalDateTime(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
      GLOOKO_EXPORT_TIMEZONE
    );
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }

  // Try US format MM/DD/YYYY HH:MM[:SS]
  const usFormat = value.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (usFormat) {
    const [, month, day, year, hour, minute, second = "0"] = usFormat;
    const timestamp = parseLocalDateTime(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
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
export function parseFloat0(value: string): number {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Create column index map from header
 */
export function createColumnMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((col, idx) => {
    const normalized = col.toLowerCase().replace(/[^a-z0-9]/g, "");
    map.set(normalized, idx);
  });
  return map;
}

/**
 * Get column value by possible names
 */
export function getColumn(
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

/**
 * Format a UTC timestamp as YYYY-MM-DD in the export timezone
 */
export function formatDateInExportTimezone(timestampMs: number): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: GLOOKO_EXPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(timestampMs));
}
