/**
 * Tests for Glooko CSV parser and ZIP extraction
 */

import { describe, it, expect } from "vitest";
import { parseCsv, extractCsvFilesFromZip } from "./scraper.js";
import { deflateRawSync } from "zlib";

describe("parseCsv", () => {
  it("parses insulin treatments from CSV", () => {
    const csv = `Timestamp,Insulin Units,Carbs (g),Source
2024-01-15T08:30:00Z,5.5,,Pump
2024-01-15T12:00:00Z,3.0,,Manual`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(2);
    expect(treatments[0]).toEqual({
      timestamp: new Date("2024-01-15T08:30:00Z").getTime(),
      type: "insulin",
      value: 5.5,
      source: "Pump",
    });
    expect(treatments[1]).toEqual({
      timestamp: new Date("2024-01-15T12:00:00Z").getTime(),
      type: "insulin",
      value: 3.0,
      source: "Manual",
    });
  });

  it("parses carb treatments from CSV", () => {
    const csv = `Timestamp,Insulin,Carbohydrates,Source
2024-01-15T08:30:00Z,,45,Food
2024-01-15T12:00:00Z,,30,Snack`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(2);
    expect(treatments[0]).toEqual({
      timestamp: new Date("2024-01-15T08:30:00Z").getTime(),
      type: "carbs",
      value: 45,
      source: "Food",
    });
    expect(treatments[1]).toEqual({
      timestamp: new Date("2024-01-15T12:00:00Z").getTime(),
      type: "carbs",
      value: 30,
      source: "Snack",
    });
  });

  it("parses both insulin and carbs on the same row", () => {
    const csv = `DateTime,Bolus Units,Carb Grams
2024-01-15T12:00:00Z,4.5,60`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(2);

    const insulin = treatments.find((t) => t.type === "insulin");
    const carbs = treatments.find((t) => t.type === "carbs");

    expect(insulin?.value).toBe(4.5);
    expect(carbs?.value).toBe(60);
  });

  it("handles US date format (MM/DD/YYYY)", () => {
    const csv = `Timestamp,Insulin,Source
01/15/2024 08:30:00,5.0,Manual`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    // Should parse the US date format correctly
    expect(treatments[0].type).toBe("insulin");
    expect(treatments[0].value).toBe(5.0);
    expect(treatments[0].source).toBe("Manual");
  });

  it("handles quoted values with commas", () => {
    const csv = `Timestamp,Insulin,Source
2024-01-15T08:30:00Z,5.5,"Pump, Model X"`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].source).toBe("Pump, Model X");
  });

  it("ignores rows with zero values", () => {
    const csv = `Timestamp,Insulin,Carbs
2024-01-15T08:30:00Z,0,0
2024-01-15T12:00:00Z,5.0,0`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].value).toBe(5.0);
  });

  it("returns empty array for CSV with no data", () => {
    const csv = `Timestamp,Insulin,Carbs`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(0);
  });

  it("returns empty array for empty CSV", () => {
    const csv = ``;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(0);
  });

  it("sorts treatments by timestamp", () => {
    const csv = `Timestamp,Insulin,Carbs
2024-01-15T12:00:00Z,3.0,
2024-01-15T08:00:00Z,5.0,
2024-01-15T10:00:00Z,4.0,`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(3);
    expect(treatments[0].timestamp).toBeLessThan(treatments[1].timestamp);
    expect(treatments[1].timestamp).toBeLessThan(treatments[2].timestamp);
  });

  it("handles missing source column gracefully", () => {
    const csv = `Timestamp,Insulin
2024-01-15T08:30:00Z,5.5`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].source).toBeUndefined();
  });

  it("skips rows with invalid timestamps", () => {
    const csv = `Timestamp,Insulin,Carbs
invalid-date,5.0,
2024-01-15T12:00:00Z,3.0,`;

    const treatments = parseCsv(csv);

    expect(treatments).toHaveLength(1);
    expect(treatments[0].value).toBe(3.0);
  });
});

/**
 * Helper to build a ZIP local file entry with optional data descriptor
 */
function buildZipEntry(
  fileName: string,
  content: string,
  options: { useDataDescriptor?: boolean } = {}
): Buffer {
  const { useDataDescriptor = false } = options;
  const fileNameBuf = Buffer.from(fileName, "utf-8");
  const uncompressedBuf = Buffer.from(content, "utf-8");
  const compressedBuf = deflateRawSync(uncompressedBuf);

  const generalPurposeFlags = useDataDescriptor ? 0x0008 : 0x0000;
  const headerCompressedSize = useDataDescriptor ? 0xffffffff : compressedBuf.length;
  const headerUncompressedSize = useDataDescriptor ? 0xffffffff : uncompressedBuf.length;

  // Local file header (30 bytes + fileName)
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(generalPurposeFlags, 6);
  header.writeUInt16LE(8, 8); // compression method: deflate
  header.writeUInt16LE(0, 10); // mod time
  header.writeUInt16LE(0, 12); // mod date
  header.writeUInt32LE(0, 14); // crc32 (placeholder)
  header.writeUInt32LE(headerCompressedSize, 18);
  header.writeUInt32LE(headerUncompressedSize, 22);
  header.writeUInt16LE(fileNameBuf.length, 26);
  header.writeUInt16LE(0, 28); // extra field length

  const parts = [header, fileNameBuf, compressedBuf];

  if (useDataDescriptor) {
    // Data descriptor: signature + crc32 + compressed size + uncompressed size
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0); // data descriptor signature
    descriptor.writeUInt32LE(0, 4); // crc32 (placeholder)
    descriptor.writeUInt32LE(compressedBuf.length, 8);
    descriptor.writeUInt32LE(uncompressedBuf.length, 12);
    parts.push(descriptor);
  }

  return Buffer.concat(parts);
}

/**
 * Build a complete ZIP with data descriptor entries + central directory.
 * Tracks actual entry sizes to compute central directory offset deterministically.
 */
function buildZipWithDataDescriptors(
  files: Array<{ fileName: string; content: string }>
): Buffer {
  const localEntries: Buffer[] = [];
  const entryMeta: Array<{
    fileName: string;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
    useDataDescriptor: boolean;
  }> = [];
  let offset = 0;

  for (const file of files) {
    const uncompressedBuf = Buffer.from(file.content, "utf-8");
    const compressedBuf = deflateRawSync(uncompressedBuf);

    entryMeta.push({
      fileName: file.fileName,
      compressedSize: compressedBuf.length,
      uncompressedSize: uncompressedBuf.length,
      localHeaderOffset: offset,
      useDataDescriptor: true,
    });

    const entry = buildZipEntry(file.fileName, file.content, { useDataDescriptor: true });
    localEntries.push(entry);
    offset += entry.length;
  }

  const localData = Buffer.concat(localEntries);
  const centralDirOffset = localData.length;

  // Build central directory entries
  const centralEntries: Buffer[] = [];
  for (const entry of entryMeta) {
    const fileNameBuf = Buffer.from(entry.fileName, "utf-8");
    const flags = entry.useDataDescriptor ? 0x0008 : 0x0000;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16); // crc32
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
    centralHeader.writeUInt16LE(fileNameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.localHeaderOffset, 42);
    centralEntries.push(Buffer.concat([centralHeader, fileNameBuf]));
  }

  const centralDirBuf = Buffer.concat(centralEntries);

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entryMeta.length, 8);
  eocd.writeUInt16LE(entryMeta.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralDirBuf, eocd]);
}

describe("extractCsvFilesFromZip", () => {
  it("extracts all CSV files from a ZIP without data descriptors", async () => {
    const files = [
      { fileName: "cgm_data_1.csv", content: "Timestamp,Value\n2024-01-01,100\n" },
      { fileName: "bolus_data_1.csv", content: "Timestamp,Insulin\n2024-01-01,5.0\n" },
      { fileName: "insulin_data_1.csv", content: "Timestamp,Total\n2024-01-01,42.0\n" },
    ];

    // Build ZIP without data descriptors (standard)
    const localEntries = files.map((f) =>
      buildZipEntry(f.fileName, f.content, { useDataDescriptor: false })
    );
    const localData = Buffer.concat(localEntries);
    // No central directory needed for standard ZIPs (existing parser works)
    const zip = localData;

    const result = await extractCsvFilesFromZip(zip);

    expect(result).toHaveLength(3);
    expect(result.map((f) => f.fileName)).toEqual([
      "cgm_data_1.csv",
      "bolus_data_1.csv",
      "insulin_data_1.csv",
    ]);
    expect(result[0].content).toContain("Timestamp,Value");
    expect(result[1].content).toContain("Timestamp,Insulin");
    expect(result[2].content).toContain("Timestamp,Total");
  });

  it("extracts all CSV files from a ZIP with data descriptors (bit 3 flag)", async () => {
    const files = [
      { fileName: "cgm_data_1.csv", content: "Timestamp,Value\n2024-01-01,100\n" },
      { fileName: "bolus_data_1.csv", content: "Timestamp,Insulin\n2024-01-01,5.0\n" },
      { fileName: "insulin_data_1.csv", content: "Timestamp,Total\n2024-01-01,42.0\n" },
    ];

    const zip = buildZipWithDataDescriptors(files);
    const result = await extractCsvFilesFromZip(zip);

    expect(result).toHaveLength(3);
    expect(result.map((f) => f.fileName)).toEqual([
      "cgm_data_1.csv",
      "bolus_data_1.csv",
      "insulin_data_1.csv",
    ]);
    expect(result[0].content).toContain("Timestamp,Value");
    expect(result[1].content).toContain("Timestamp,Insulin");
    expect(result[2].content).toContain("Timestamp,Total");
  });

  it("skips non-CSV files in ZIP", async () => {
    const files = [
      { fileName: "readme.txt", content: "Not a CSV" },
      { fileName: "cgm_data_1.csv", content: "Timestamp,Value\n2024-01-01,100\n" },
    ];

    const zip = buildZipWithDataDescriptors(files);
    const result = await extractCsvFilesFromZip(zip);

    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe("cgm_data_1.csv");
  });
});
