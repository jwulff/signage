# Cloud Relay Deployment via Lightsail + WireGuard

*Date: 2026-01-19 1730*

## Why

The Pixoo device sits behind home network NAT and cannot receive incoming connections. The existing solution requires running a local relay on an always-on computer, which is inconvenient and unreliable (computer sleeps, reboots, etc.).

We explored serverless options but hit a wall:
- **AWS VPC + NAT Gateway**: ~$70/month — absurd for a hobby project
- **Lambda + VPN**: Still needs NAT Gateway for outbound
- **IoT Core**: Still needs a local MQTT subscriber
- **Divoom Cloud API**: Unreliable, rate-limited, undocumented

The solution: a $3.50/month Lightsail nano instance that tunnels into the home network via WireGuard VPN. The instance connects to the router's WireGuard server, gaining LAN access to push frames directly to the Pixoo.

## How

### Architecture

```
AWS Lambda (cron) → API Gateway WebSocket → Lightsail Instance
                                                    │
                                            WireGuard VPN tunnel
                                                    │
                                                    ▼
                                    Home Router ← LAN → Pixoo64
```

### Implementation

1. **WireGuard server on router** — Most modern routers (UniFi, pfSense, OpenWrt, etc.) support WireGuard natively. Created a client peer for the cloud instance.

2. **Lightsail nano instance** — Ubuntu 22.04, 512MB RAM, $3.50/month. Includes 1TB transfer and free static IP.

3. **WireGuard client on instance** — Connects to home router, routes only home LAN subnet through tunnel (not all traffic).

4. **Relay as systemd service** — Auto-starts, auto-restarts, survives reboots. Depends on WireGuard tunnel being up.

5. **Deployment scripts** — Build locally with dependencies bundled (avoids OOM on nano instance), upload via SCP, extract and restart service.

### Files Created

```
deploy/lightsail/
├── README.md              # 17KB comprehensive guide
├── setup.sh               # Instance provisioning script
├── deploy-relay.sh        # Code deployment script
└── wireguard.conf.template # WireGuard config reference
```

## Key Design Decisions

### Bundle dependencies locally

The nano instance has only 512MB RAM. Running `npm install` on the instance causes OOM kills. Solution: install dependencies on the development machine and include `node_modules` in the deployment tarball. Adds ~100KB to bundle but eliminates installation issues.

### Route only LAN traffic through VPN

The default WireGuard config from many routers uses `AllowedIPs = 0.0.0.0/0`, routing ALL traffic through the home network. Changed to `AllowedIPs = 192.168.1.0/24` to only route home LAN traffic through the tunnel. This:
- Reduces latency for non-LAN traffic
- Reduces bandwidth through home connection
- Keeps AWS → internet traffic direct

### PersistentKeepalive for NAT traversal

Added `PersistentKeepalive = 25` to the WireGuard config. Without this, the tunnel goes idle and NAT mappings expire, causing the connection to drop. The 25-second interval keeps the tunnel alive through any NAT.

### systemd dependency on WireGuard

The relay service specifies `Requires=wg-quick@wg0.service` and `After=wg-quick@wg0.service`. This ensures:
- Relay only starts after WireGuard tunnel is up
- Relay stops if WireGuard goes down
- Both restart together on reboot

### Router-agnostic documentation

Rather than documenting only UniFi (which we tested with), the README includes instructions for pfSense, OPNsense, OpenWrt, MikroTik, and others. Also notes that WireGuard can run on any Linux device on the LAN if the router doesn't support it.

### Alternative cloud providers

Documented that the same approach works with DigitalOcean ($4), Vultr ($2.50), Hetzner (€3.29), and notably **Oracle Cloud Free Tier** (genuinely $0/month forever). Users can choose based on their preferences.

## What's Next

- **Monitoring**: Could add CloudWatch alarms for instance health, or a simple uptime check via cron
- **Terraform/Pulumi**: Could codify the Lightsail infrastructure for reproducible deployments
- **Multi-display support**: The relay currently targets one Pixoo; could extend to multiple displays on the same LAN
- **Oracle Cloud guide**: A dedicated guide for the free tier option would help cost-conscious users
