# Clock Date Display

*Date: 2026-01-19 0937*

## Why

The clock showed only time with no date context. Adding the date helps orient viewers, especially for a display that's always on.

## How

1. Extended the tiny 3x5 font with uppercase A-Z letters
2. Added date rendering below time as "MON JAN 19 2026" at row 13
3. Removed the horizontal separator bar between top/bottom halves
4. Adjusted spacing: moved weather band down 2px for less crowded layout
5. Made date text dimmer using clockAmPm color instead of bright white

## Key Design Decisions

- Used 3-letter day/month abbreviations to fit width constraints
- Date positioned between time and weather band for logical visual flow
- Dimmer color keeps date visible without competing with time
- Removed separator bar because date now provides visual separation
- Quoted letter keys in TINY_FONT for consistency with numbers/symbols

## What's Next

- Could add day-of-year or week number for productivity tracking
- Might add special formatting for holidays or events
