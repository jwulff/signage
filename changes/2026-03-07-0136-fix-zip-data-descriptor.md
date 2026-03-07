# Fix ZIP extraction missing files due to data descriptors

*Date: 2026-03-07 0136*

## Why
The Glooko scraper was only extracting the first CSV file (cgm_data_1.csv) from the ZIP export. All other files (bolus, insulin, basal, etc.) were silently dropped, causing daily insulin history to show 0 for the last 4+ days.

## How
The ZIP parser read `compressedSize` from local file headers to advance through the archive. Glooko's ZIP uses data descriptors (general purpose bit flag bit 3), which sets local header sizes to `0xFFFFFFFF`. The parser treated this as the actual compressed size, jumped past the buffer after the first file, and exited.

Fixed by parsing the central directory at the end of the ZIP, which always has accurate sizes regardless of data descriptors. Falls back to the old local-header approach for ZIPs without a central directory.

## Key Design Decisions
- Central directory parsing is the primary path since it's always reliable
- Local file header fallback preserved for backward compatibility with simple ZIPs
- No external ZIP library added — the manual parser handles all cases Glooko produces

## What's Next
- Monitor next scraper run to confirm all CSV file types are extracted
