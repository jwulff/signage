# Signage

Personal digital signage system for Pixoo64 and other displays.

## Overview

Signage is a serverless system that pushes real-time content to LED matrix displays. It uses AWS infrastructure to manage connections and broadcast frames to multiple terminals simultaneously.

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Lambda    │────▶│  WebSocket  │────▶│    Relay     │────▶│   Pixoo64   │
│  (content)  │     │     API     │     │    (CLI)     │     │  (display)  │
└─────────────┘     └──────┬──────┘     └──────────────┘     └─────────────┘
                          │
                          │             ┌──────────────┐
                          └────────────▶│ Web Emulator │
                                        │  (browser)   │
                                        └──────────────┘
```

## Quick Start

### View the Web Emulator

Open the web emulator in your browser:
```
https://d3138ekbi7z9yw.cloudfront.net
```

### Send a Test Frame

Trigger a test pattern (broadcasts to all connected terminals):

```bash
# Rainbow gradient
curl "https://hpaqthkicl.execute-api.us-east-1.amazonaws.com?pattern=rainbow"

# Color bars
curl "https://hpaqthkicl.execute-api.us-east-1.amazonaws.com?pattern=bars"

# Custom text
curl "https://hpaqthkicl.execute-api.us-east-1.amazonaws.com?pattern=text&text=Hello&color=pink"
```

### Run the Relay (for Pixoo64)

Connect a local Pixoo64 device to the cloud:

```bash
cd packages/relay
pnpm build
node dist/cli.js --ws 'wss://mew9rfc709.execute-api.us-east-1.amazonaws.com/$default'
```

On first run, it will ask to scan for your Pixoo and save the IP for next time.

## Architecture

### Packages

| Package | Description |
|---------|-------------|
| `packages/core` | Shared types and Pixoo protocol (RGB encoding, frame utilities) |
| `packages/functions` | Lambda handlers for WebSocket API and test endpoints |
| `packages/relay` | CLI that bridges AWS WebSocket to local Pixoo HTTP API |
| `packages/web` | React web emulator with canvas-based 64×64 display |

### Infrastructure (SST v3)

- **WebSocket API** - Maintains persistent connections to terminals
- **DynamoDB** - Stores connection state
- **CloudFront** - Serves the web emulator
- **Lambda** - Handles WebSocket events and content generation

### Data Flow

1. **Content Generation**: Lambda creates a 64×64 RGB frame
2. **Broadcast**: Frame is sent via WebSocket to all connected terminals
3. **Display**:
   - Web emulator renders to canvas
   - Relay forwards to Pixoo via local HTTP API

## Test Endpoint

The test endpoint generates frames and broadcasts to all connected terminals.

### Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `pattern` | `rainbow`, `bars`, `text` | `rainbow` | Frame pattern to generate |
| `text` | any string | `Hello` | Text to display (pattern=text only) |
| `color` | `white`, `red`, `green`, `blue`, `yellow`, `cyan`, `magenta`, `orange`, `pink` | `white` | Text color |
| `width` | integer | `64` | Frame width |
| `height` | integer | `64` | Frame height |

### Examples

```bash
# Rainbow gradient
curl "https://hpaqthkicl.execute-api.us-east-1.amazonaws.com"

# Pink text saying "Hi"
curl "https://hpaqthkicl.execute-api.us-east-1.amazonaws.com?pattern=text&text=Hi&color=pink"

# Multi-line text (use \n)
curl "https://hpaqthkicl.execute-api.us-east-1.amazonaws.com?pattern=text&text=Line1\\nLine2"

# Color test bars
curl "https://hpaqthkicl.execute-api.us-east-1.amazonaws.com?pattern=bars"
```

### Response

```json
{
  "success": true,
  "pattern": "text",
  "width": 64,
  "height": 64,
  "connections": {
    "total": 2,
    "success": 2,
    "failed": 0
  }
}
```

## Relay CLI

The relay bridges the AWS WebSocket API to a local Pixoo device.

### Installation

```bash
cd packages/relay
pnpm install
pnpm build
```

### Usage

```bash
# First run - prompts to scan for Pixoo
node dist/cli.js --ws <WEBSOCKET_URL>

# Specify IP manually
node dist/cli.js --pixoo <IP> --ws <WEBSOCKET_URL>

# Scan network
node dist/cli.js scan

# Forget saved IP
node dist/cli.js forget
```

| Option | Required | Description |
|--------|----------|-------------|
| `--pixoo <ip>` | No | Pixoo device IP (saved for next time) |
| `--ws <url>` | Yes | WebSocket API URL |
| `--terminal <id>` | No | Terminal ID to register as |

### First Run

On first run without `--pixoo`, the relay will:

1. Ask if you want to scan the network
2. Scan your subnet for Pixoo devices
3. Let you select a device (if multiple found)
4. Save the IP to `~/.signage/config.json`

Future runs use the saved IP automatically.

### Features

- **Auto-discovery**: Scans local network for Pixoo devices
- **Persistent config**: Saves IP so you only scan once
- **Auto-reconnect**: Exponential backoff (1s → 30s) on disconnect
- **Keepalive**: Sends ping every 5 minutes to prevent idle timeout
- **Channel switch**: Automatically switches Pixoo to custom channel on startup

### Examples

```bash
# Normal usage (uses saved IP or prompts to scan)
node dist/cli.js --ws 'wss://mew9rfc709.execute-api.us-east-1.amazonaws.com/$default'

# Specify IP (saves for next time)
node dist/cli.js \
  --pixoo 192.168.1.100 \
  --ws 'wss://mew9rfc709.execute-api.us-east-1.amazonaws.com/$default'

# With terminal ID
node dist/cli.js \
  --ws 'wss://mew9rfc709.execute-api.us-east-1.amazonaws.com/$default' \
  --terminal living-room
```

## Development

### Prerequisites

- Node.js 18+
- pnpm 9+
- AWS account with credentials configured

### Setup

```bash
# Install dependencies
pnpm install

# Start SST dev mode (deploys to AWS)
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

### Deploy

```bash
# Deploy to dev stage
pnpm deploy

# Deploy to production
pnpm deploy:prod
```

## Deployed URLs

| Resource | URL |
|----------|-----|
| Web Emulator | https://d3138ekbi7z9yw.cloudfront.net |
| Test API | https://hpaqthkicl.execute-api.us-east-1.amazonaws.com |
| WebSocket | wss://mew9rfc709.execute-api.us-east-1.amazonaws.com/$default |

## License

Private project - not for distribution.
