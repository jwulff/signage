/**
 * Base types shared by all diabetes records
 */

/**
 * All diabetes records share these common fields
 */
export interface BaseRecord {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Device serial number (e.g., insulin pump ID) */
  deviceSerial?: string;
  /** Source file this record came from */
  sourceFile?: string;
  /** When this record was imported */
  importedAt: number;
}
