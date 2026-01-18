# Blood Sugar Widget

*Date: 2026-01-18 2312*

## Why

Abigail uses a Dexcom G7 continuous glucose monitor for Type 1 diabetes management. Having her current blood sugar reading displayed on the signage system provides at-a-glance visibility for the whole family without needing to check a phone.

## How

Created a new widget that fetches glucose data from the Dexcom Share API:
- Uses the `dexcom-share-api` npm package to authenticate and retrieve readings
- Runs every 1 minute to catch new readings quickly (Dexcom updates every 5 minutes)
- Returns structured data including glucose value, trend arrow, and range status
- Terminals handle display rendering based on the data

## Key Design Decisions

- **Data-only widget**: The widget returns structured data (glucose, trend, range status) rather than rendered frames. This keeps the widget simple and lets terminals decide how to display it.
- **Standard T1D thresholds**: Using widely-accepted ranges (Low < 70, Normal 70-180, High > 180 mg/dL) for range classification.
- **Stale data detection**: Marks readings as stale if >10 minutes old, so terminals can indicate when data may be outdated.
- **Delta calculation**: Includes the change from the previous reading for context on glucose trends.
- **US region hardcoded**: Since this is a personal project for a US user, the region is hardcoded to "us".

## What's Next

- Terminal rendering: Web emulator and Pixoo64 relay need to be updated to display the blood sugar widget
- Alert thresholds: Could add configurable alert levels for urgent lows/highs
- Historical trends: Could show mini graph of recent readings
