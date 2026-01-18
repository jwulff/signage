# Widget Updater Framework

*Date: 2026-01-17 2201*

## Why

The signage system needed a framework for widgets to update their data on a schedule and broadcast to connected terminals. Without this, each widget would need to implement its own scheduling, connection management, and broadcast logic.

## How

Created a widget updater framework with:

1. **WidgetUpdater Interface**: Standard contract for widgets to implement
   - `id`: Unique widget identifier
   - `name`: Display name
   - `schedule`: Cron expression (e.g., "rate(1 minute)")
   - `update()`: Async function that returns widget data

2. **Dispatcher**: Centralized handler that:
   - Checks for active WebSocket connections before fetching data
   - Calls the widget's update function
   - Broadcasts results to all connected terminals
   - Handles errors gracefully

3. **Connection-Aware Scheduling**: Widgets skip updates when no terminals are connected, saving API calls and compute.

## Key Design Decisions

- **Data-only widgets**: Widgets return structured data, letting terminals decide how to render. This allows the web emulator and Pixoo to render differently.
- **Skip when disconnected**: No point fetching data if nobody's listening.
- **Centralized error handling**: The dispatcher catches and logs errors without crashing.

## What's Next

- This framework was later superseded by the compositor pattern for the Pixoo display, which renders widgets to a single combined frame rather than sending separate data updates.
- The framework may still be useful for terminals that prefer raw data (like the web emulator).
