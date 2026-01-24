# Glooko Treatment Data Integration

*Date: 2026-01-24 1039*

## Why

The display should show insulin and carbohydrate treatment data alongside blood glucose readings. Glooko aggregates diabetes data from insulin pumps and manual entries, but doesn't provide a public API. This integration scrapes the Glooko web interface to retrieve treatment data.

## How

- **Browser automation**: Puppeteer with `@sparticuz/chromium` logs into Glooko and exports CSV data
- **Hourly scraping**: Lambda function runs hourly (acceptable for treatment data that changes less frequently than glucose)
- **Visual integration**: Treatment summary ("8.5U 42G") displayed next to glucose readings, with treatment markers overlaid on the glucose charts

## Key Design Decisions

- **Puppeteer over API**: Glooko's API isn't publicly accessible, so web scraping is the only option. Kept selectors centralized in one file for easy updates when Glooko's UI changes.

- **Hourly updates**: Treatment data doesn't change as frequently as glucose (which updates every 5 minutes), so hourly scraping reduces load while keeping data reasonably current.

- **6-hour staleness threshold**: Treatment data hidden if older than 6 hours, preventing display of outdated information while being lenient enough for overnight gaps.

- **Integrated rendering**: Treatment markers (triangles) overlay the existing glucose charts rather than creating a separate display region, maintaining visual cohesion.

- **Lambda memory**: 1024MB for Puppeteer (Chromium requires significant memory), 120s timeout for login + export flow.

## Local Testing Results

Tested with real Glooko account (2026-01-24):
- **Login**: Successfully authenticates via cookie consent banner handling
- **Export**: Modal-based CSV export triggers ZIP download
- **Data**: 285 treatments parsed (178 insulin, 107 carbs) from 2-week export
- **4-hour totals**: 7.0u insulin, 40g carbs (matches manual verification)

## Robust Historical Database

The integration now stores all Glooko data granularly in DynamoDB with idempotent writes, building a comprehensive historical diabetes database.

### Data Model (`data-model.ts`)

12 strongly-typed record types covering all Glooko CSV exports:
- **CGM readings** - Continuous glucose monitor data (every 5 min)
- **BG readings** - Manual finger stick blood glucose
- **Bolus records** - Insulin doses with carbs, BG input, carb ratios
- **Basal records** - Background insulin delivery rates
- **Daily insulin summary** - Daily totals for bolus/basal/total
- **Alarms** - Device alerts and events
- **Carbs** - Standalone carbohydrate entries
- **Food** - Detailed food log with macros
- **Exercise** - Activity log with intensity/duration
- **Medication** - Non-insulin medications
- **Manual insulin** - Pen/syringe injections
- **Notes** - Free-form text entries

### DynamoDB Key Design (`storage.ts`)

Single-table design with composite keys for efficient queries:
```
PK: USER#{userId}#{recordType}    (partition by user + data type)
SK: {timestamp}#{contentHash}     (sort by time, hash for dedup)
```

Features:
- **Idempotent writes**: Conditional PutItem prevents duplicate records
- **Content-based hashing**: Same data = same key = no duplicates
- **Time-range queries**: Efficient retrieval by type and time window
- **GSI for cross-type queries**: Query all record types for a user

### CSV Parser (`csv-parser.ts`)

Comprehensive parser handling:
- Glooko's metadata header row (Medical Record Number, Name, Date Range)
- Multiple date formats (ISO, US, Glooko custom)
- 12 file type parsers with flexible column mapping
- Error collection without aborting on parse failures

### Lambda Handler Updates

The handler now:
1. Exports 14 days of data (for historical depth)
2. Parses all CSV types into strongly-typed records
3. Stores records idempotently (new records written, duplicates skipped)
4. Logs import metadata with record counts
5. Maintains legacy treatment summary for compositor compatibility

## What's Next

- Deploy to AWS and configure secrets via `sst secret set`
- Monitor for Glooko UI changes that could break selectors
- Consider adding retry logic for transient scraping failures
- Update compositor to use `GlookoStorage.getTreatmentSummary()` instead of legacy format
- Add CGM data to display (if Dexcom isn't primary source)
