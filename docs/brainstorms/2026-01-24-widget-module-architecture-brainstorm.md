# Widget Module Architecture Brainstorm

**Date:** 2026-01-24
**Status:** Ready for planning

## What We're Building

A unified widget architecture where each widget is a self-contained module with:
- Its own folder containing updater, renderer, and related code
- A consistent `WidgetDefinition` interface
- Layout defaults that can be overridden by a central config

## Why This Approach

**Pain points addressed:**
- Inconsistent patterns (Oura has its own structure, others use WidgetUpdater)
- Scattered code (updaters in one folder, renderers in another)
- No single source of truth (schedule in types, crons in infra, layout in frame-composer)
- Duplicated logic (compositor has inline Dexcom calls)

**Chosen approach:** Widget Modules over alternatives because:
- Clean break is acceptable (no backwards compatibility needed)
- Future extensibility matters (expect to add more widgets)
- Collocation provides clear ownership and easier navigation

## Key Decisions

1. **Self-contained widget folders** - Each widget gets `widgets/<name>/` with index.ts, updater.ts, renderer.ts

2. **Unified WidgetDefinition interface** - All widgets export the same shape including:
   - Updater function/class
   - Renderer function/class
   - Schedule configuration
   - Default layout region
   - OAuth requirements (if any)

3. **Layout: defaults + overrides** - Widgets declare preferred position/size, central layout config can override

4. **Auto-discovery registry** - Registry scans widgets folder rather than manual imports

5. **Migrate all 4 widgets** - Clock, Blood Sugar, Oura, News Digest all move to new structure

## Open Questions

- Should OAuth flows (Oura, potentially others) be part of the widget module or a shared service?
- How should widget-to-widget dependencies work (if ever needed)?
- What's the strategy for widget-specific infrastructure (Oura has its own cron)?

## Next Steps

Run `/workflows:plan` to create an implementation plan for this architecture.
