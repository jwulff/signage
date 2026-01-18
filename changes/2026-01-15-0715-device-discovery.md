# Pixoo Device Discovery

*Date: 2026-01-15 0715*

## Why

Users needed to know their Pixoo's IP address to use the relay. This required opening the Divoom app, navigating to device settings, and manually copying the IP.

## How

Added simple local network scan with IP persistence:

1. **First run**: Prompts "Scan network for Pixoo devices?"
2. **Scans subnet**: Probes port 80 for Pixoo REST API
3. **Saves IP**: Stores in `~/.signage/config.json`
4. **Next run**: Uses saved IP automatically

### Commands

```bash
# Normal usage (prompts if no IP saved)
signage-relay --ws wss://...

# Specify IP manually (saves for next time)
signage-relay --pixoo 192.168.1.100 --ws wss://...

# Scan network
signage-relay scan

# Forget saved IP
signage-relay forget
```

## Key Design Decisions

- **No cloud dependency**: Only local subnet scan, works offline
- **Interactive flow**: Asks before scanning, doesn't assume
- **Persistent config**: Scans once, remembers forever
- **Simple storage**: Plain JSON in `~/.signage/config.json`

## What's Next

- Could verify saved IP is still valid before connecting
