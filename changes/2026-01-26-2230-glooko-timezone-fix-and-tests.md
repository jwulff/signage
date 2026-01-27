# Fix Glooko Timezone Parsing Order and Add Comprehensive Tests

*Date: 2026-01-26 2230*

## Why

The previous timezone fix (PR #122) introduced a subtle bug: naive timestamps were being parsed by `new Date()` BEFORE checking for explicit timezone markers. This caused timestamps with explicit timezones (like `Z` or `+00:00`) to be double-converted, and more critically, the regex `/Z|[+-]\d{2}:\d{2}/` could match unrelated text (e.g., "PIZZA" contains "Z").

Additionally, daily insulin records were getting the wrong dates because `new Date(timestamp).getDate()` extracts UTC date components on AWS Lambda, not Pacific time.

## How

### Fix 1: Correct Timestamp Parsing Order
Changed `parseTimestamp()` to check for explicit timezone markers FIRST, before attempting any custom parsing:
- Anchored regex to end of string: `/[Zz]$|[+-]\d{2}:\d{2}$/`
- Explicit timezone timestamps use `new Date()` directly (correct UTC conversion)
- Naive timestamps fall through to Pacific time conversion

### Fix 2: Pacific Date for Daily Insulin
Added `formatDateInPacific()` helper using `Intl.DateTimeFormat` to correctly extract the Pacific date from a UTC timestamp. This ensures daily insulin records are assigned to the correct calendar date in the user's timezone.

### Fix 3: Comprehensive Test Coverage
Added 30 tests covering all aspects of Glooko data interpretation:
- Explicit timezone parsing (Z suffix, +/- offsets)
- Naive timestamp handling (Glooko Pacific time format)
- DST transitions (spring forward, fall back)
- Daily insulin date assignment in Pacific time
- CGM and bolus record parsing
- Error handling edge cases

## Key Design Decisions

- **Regex anchoring**: `/[Zz]$|[+-]\d{2}:\d{2}$/` prevents false positives like "PIZZA" matching the Z pattern
- **Intl.DateTimeFormat**: More reliable than manual date math for timezone-aware formatting, handles DST automatically
- **en-CA locale**: Formats dates as YYYY-MM-DD which matches our storage format

## What's Next

- Monitor production to verify daily insulin totals match Glooko control data
- Consider adding similar test coverage to other CSV parsers if needed
