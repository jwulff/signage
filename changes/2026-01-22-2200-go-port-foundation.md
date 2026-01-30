# Go Port Foundation

*Date: 2026-01-22 2200*

## Why

The existing TypeScript/AWS Lambda architecture requires:
- AWS deployment for testing
- Network connectivity for Pixoo interaction
- Complex local development setup

A unified Go codebase enables:
- **Local mode**: Single portable binary with TUI, direct Pixoo communication
- **Lambda mode**: Same code deployed to AWS for cloud operation
- Cross-platform distribution (Linux/macOS/Windows, ARM64/AMD64)

## How

Implemented Epic 1-4 of the Go port plan using strict TDD methodology:

1. **Project Foundation**
   - Go module with proper structure
   - Makefile with test/lint/build targets
   - Cross-compilation support for all platforms

2. **Core Domain Types** (`internal/domain/`)
   - `Frame`, `RGB` - pixel data with drawing primitives
   - `Terminal`, `Connection` - device management
   - `WidgetState`, `WidgetConfig`, `TimeSeriesPoint` - widget system

3. **Pixoo Protocol** (`internal/pixoo/`)
   - Base64 frame encoding/decoding
   - HTTP client with timeout handling
   - Command structures for Draw/SendHttpGif, brightness, etc.

4. **Rendering Engine** (`internal/render/`)
   - 5x7 bitmap font (all chars, digits, symbols)
   - Text rendering with alignment options
   - Color utilities (glucose color gradients, lerp, dim)
   - Sparkline chart renderer with time markers

5. **Storage Layer** (`internal/storage/`)
   - Store interface with full CRUD operations
   - SQLite implementation (pure Go, no CGO)
   - Schema migrations, time series support

## Key Design Decisions

- **Pure Go SQLite** (`modernc.org/sqlite`): Enables single-binary distribution without CGO
- **Test-First Development**: 119 tests ensuring behavior matches TypeScript implementation
- **Interface Segregation**: Storage interface allows swapping SQLite (local) for DynamoDB (Lambda)
- **Separated Rendering**: Chart/text/color logic independent of widget data fetching

## Test Coverage

| Package | Tests | Status |
|---------|-------|--------|
| domain | 26 | PASS |
| pixoo | 19 | PASS |
| render | 50 | PASS |
| storage | 4 | PASS |
| storage/sqlite | 20 | PASS |
| **Total** | **119** | **PASS** |

## What's Next

1. **Frame Composer**: Combine clock, glucose, chart into single frame
2. **Widget Updaters**: Clock, Weather (Open-Meteo), Blood Sugar (Dexcom API)
3. **TUI**: Bubble Tea interface for local mode
4. **WebSocket Broadcaster**: Local web emulator support

## Files Changed

```
signage-go/
├── cmd/signage/main.go           # Main entry point
├── internal/
│   ├── domain/
│   │   ├── frame.go              # Frame, RGB types
│   │   ├── terminal.go           # Terminal, Connection
│   │   └── widget.go             # Widget state types
│   ├── pixoo/
│   │   ├── protocol.go           # Pixoo commands
│   │   └── client.go             # HTTP client
│   ├── render/
│   │   ├── font.go               # 5x7 bitmap font
│   │   ├── text.go               # Text rendering
│   │   ├── colors.go             # Color constants
│   │   └── chart.go              # Sparkline chart
│   └── storage/
│       ├── store.go              # Store interface
│       └── sqlite/
│           ├── store.go          # SQLite implementation
│           └── migrations.go     # Schema DDL
├── go.mod
├── go.sum
└── Makefile
```
