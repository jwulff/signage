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

## What's Next

- Deploy to AWS and configure secrets via `sst secret set`
- Monitor for Glooko UI changes that could break selectors
- Consider adding retry logic for transient scraping failures
- Potentially add pump basal rate data if available in CSV export
