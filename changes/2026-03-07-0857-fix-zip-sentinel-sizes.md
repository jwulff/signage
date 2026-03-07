# Fix ZIP extraction when central directory also has 0xFFFFFFFF sizes

*Date: 2026-03-07 0857*

## Why
PR #249 fixed ZIP extraction to use the central directory for file sizes instead of unreliable local file headers. However, Glooko's ZIP exports store 0xFFFFFFFF in BOTH locations — the central directory sizes are sentinel values too. The bounds check correctly rejected these as invalid, causing ALL files to be skipped (worse than before: 0 files instead of 1).

## How
When central directory sizes are 0xFFFFFFFF, we compute data regions from consecutive local header offsets (which the central directory stores correctly). The compressed data for entry N sits between its local header's data start and the next entry's local header. `inflateRawSync` naturally stops at the deflate stream boundary within this region, correctly handling any trailing data descriptors.

## Key Design Decisions
- Sort entries by local header offset to compute boundaries between consecutive entries
- Use the central directory's own start offset as the boundary for the last entry
- Let `inflateRawSync` find the deflate stream end rather than computing exact sizes
- Added test that reproduces Glooko's exact ZIP format (0xFFFFFFFF everywhere)

## What's Next
- Monitor next scraper run to confirm all 12 CSV file types are extracted
