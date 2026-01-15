# Signage: Personal Digital Signage System

## Vision

A serverless AWS-backed system for personal digital signage, enabling:
- Multiple display terminals (Pixoo64, web emulator, future devices)
- Widget-based data composition with intelligent layout
- Real-time updates via pub/sub architecture
- Reliability-first serverless design
- Zero-maintenance operation

Inspired by [Aaron Patterson's Pixoo64 Ruby client](https://tenderlovemaking.com/2026/01/01/pixoo64-ruby-client/).

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud (us-east-1)                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Data Sources          Processing              Delivery                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────────────────┐ │
│  │EventBridge  │─────▶│ SNS Topic   │─────▶│ API Gateway WebSocket   │ │
│  │(Scheduled)  │      │(widget-data)│      │ (terminal connections)  │ │
│  └─────────────┘      └──────┬──────┘      └────────────┬────────────┘ │
│                              │                          │              │
│  ┌─────────────┐      ┌──────▼──────┐                   │              │
│  │ Lambda      │      │ DynamoDB    │                   │              │
│  │ (external   │      │ - terminals │                   │              │
│  │  API pulls) │      │ - widgets   │                   │              │
│  └─────────────┘      │ - history   │                   │              │
│                       └─────────────┘                   │              │
│                                                         │              │
│  ┌─────────────────────────────────────────────────────┴────────────┐ │
│  │ CloudFront + S3: Web Emulator (React + Vite)                     │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket (wss://)
                                    ▼
                 ┌─────────────────────────────────────────┐
                 │           Home Network                   │
                 │  ┌───────────────────────────────────┐  │
                 │  │  Local Relay (Node.js CLI)        │  │
                 │  │  - Maintains WebSocket to AWS     │  │
                 │  │  - Receives frame updates         │  │
                 │  │  - Pushes to Pixoo HTTP API       │  │
                 │  └───────────────┬───────────────────┘  │
                 │                  │ HTTP POST             │
                 │                  ▼                       │
                 │  ┌───────────────────────────────────┐  │
                 │  │  Pixoo64 (64x64 LED matrix)       │  │
                 │  └───────────────────────────────────┘  │
                 └─────────────────────────────────────────┘
```

---

## Core Concepts

### Terminals

A terminal is a display device. Each terminal has:
- **ID**: Unique identifier
- **Type**: `pixoo64`, `web`, `other`
- **Size**: Width × Height in pixels (e.g., 64×64)
- **Connection**: WebSocket connection ID when online

Terminals register via WebSocket on connect and receive frame updates.

### Widgets

Widgets are data sources that contribute to the display. Each widget:
- **Publishes** data to SNS topic
- **Declares** its display requirements (size hints, priority)
- **Updates** independently on its own schedule

Examples: weather, calendar, clock, air quality, stock prices.

### Frames

A frame is a complete bitmap to display:
- **Width × Height** pixels
- **RGB data** (3 bytes per pixel)
- **Base64 encoded** for transmission

The frame buffer is the source of truth. When any widget updates:
1. System receives widget data update
2. Re-composes full frame with all current widget states
3. Broadcasts complete frame to all terminals

### Layout Engine (Future)

An AI-powered layout engine that:
- Takes widget data and display constraints
- Intelligently arranges information on available real estate
- Optimizes for readability and visual hierarchy
- Adapts to different display sizes

---

## Data Flow

### Widget Update Flow

```
Widget Lambda                SNS Topic               Processor Lambda
     │                           │                          │
     │──── Publish data ────────▶│                          │
     │                           │──── Trigger ────────────▶│
     │                           │                          │
     │                           │                    ┌─────┴─────┐
     │                           │                    │ Get all   │
     │                           │                    │ widget    │
     │                           │                    │ data from │
     │                           │                    │ DynamoDB  │
     │                           │                    └─────┬─────┘
     │                           │                          │
     │                           │                    ┌─────┴─────┐
     │                           │                    │ Compose   │
     │                           │                    │ frame     │
     │                           │                    └─────┬─────┘
     │                           │                          │
     │                           │                          ▼
     │                           │                   WebSocket API
     │                           │                          │
     │                           │           ┌──────────────┼──────────────┐
     │                           │           ▼              ▼              ▼
     │                           │        Relay          Web            Other
     │                           │        Client       Emulator       Terminals
     │                           │           │              │              │
     │                           │           ▼              │              │
     │                           │        Pixoo64          │              │
```

### Terminal Connection Flow

```
Terminal (Relay/Web)           API Gateway           Lambda
        │                          │                    │
        │──── WebSocket ──────────▶│                    │
        │     Connect              │────── $connect ───▶│
        │                          │                    │
        │                          │              ┌─────┴─────┐
        │                          │              │ Store     │
        │                          │              │ connection│
        │                          │              │ in DDB    │
        │                          │              └─────┬─────┘
        │                          │                    │
        │◀──── Frame update ───────│◀─────────────────────
        │                          │                    │
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Infrastructure | SST v3 (Ion) | Infrastructure as Code |
| Compute | AWS Lambda | Serverless functions |
| API | API Gateway WebSocket | Real-time communication |
| Database | DynamoDB | State storage |
| Messaging | SNS | Pub/sub for widget updates |
| Scheduling | EventBridge | Periodic data fetching |
| CDN | CloudFront | Web emulator hosting |
| Storage | S3 | Static assets |
| Frontend | React + Vite | Web emulator |
| Local | Node.js CLI | Pixoo relay |

---

## Pixoo Protocol

### Device API

The Pixoo64 has a local HTTP API at port 80:

```
POST http://<ip>/post
Content-Type: application/json
```

### Send Frame Command

```json
{
  "Command": "Draw/SendHttpGif",
  "PicNum": 1,
  "PicWidth": 64,
  "PicOffset": 0,
  "PicID": 1,
  "PicSpeed": 1000,
  "PicData": "<base64-rgb-data>"
}
```

### Image Format

- **Resolution**: 64×64 pixels
- **Color depth**: 24-bit RGB (8 bits per channel)
- **Pixel order**: Left to right, top to bottom
- **Byte order**: [R0, G0, B0, R1, G1, B1, ...]
- **Encoding**: Base64
- **Raw size**: 64 × 64 × 3 = 12,288 bytes
- **Encoded size**: ~16,384 bytes

---

## Project Phases

### P0: Basic Pipeline (Current)

Goal: Get a bitmap displaying on Pixoo via AWS.

- [x] Repository setup
- [x] SST infrastructure skeleton
- [x] Core types and Pixoo protocol
- [x] Lambda handlers (stubs)
- [x] Relay CLI (basic)
- [x] Web emulator (basic)
- [ ] Deploy and test end-to-end
- [ ] Display test bitmap on Pixoo

### P1: Widget System

Goal: Multiple widgets composing on display.

- [ ] SNS topic for widget updates
- [ ] Widget data storage in DynamoDB
- [ ] Frame composition logic
- [ ] Clock widget (time display)
- [ ] Weather widget (API integration)

### P2: AI Layout Engine

Goal: Intelligent data presentation.

- [ ] Layout constraints system
- [ ] Claude API integration for layout decisions
- [ ] Adaptive rendering for different sizes
- [ ] Priority-based space allocation

### P3: Multi-Terminal

Goal: Support multiple displays.

- [ ] Terminal registration system
- [ ] Per-terminal configuration
- [ ] Different sizes per terminal
- [ ] Terminal groups/zones

### P4: Production Hardening

Goal: Reliable 24/7 operation.

- [ ] Relay as launchd service
- [ ] Relay as Docker container
- [ ] Health monitoring
- [ ] Alerting
- [ ] Graceful degradation

---

## References

- [Aaron Patterson's Pixoo64 Ruby Client](https://tenderlovemaking.com/2026/01/01/pixoo64-ruby-client/)
- [Pixoo API Notes](https://github.com/Grayda/pixoo_api/blob/main/NOTES.md)
- [divoom Rust crate](https://github.com/r12f/divoom)
- [pixoo-rest Python](https://github.com/4ch1m/pixoo-rest)
- [SST v3 Documentation](https://sst.dev)
