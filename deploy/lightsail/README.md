# Cloud Relay Deployment Guide

Run the signage relay on AWS Lightsail with a VPN tunnel to your home network. This eliminates the need to keep a local computer running 24/7.

**Monthly Cost: ~$3.50** (Lightsail nano instance)

## Why This Approach?

The Pixoo device sits on your home network behind NAT and cannot receive incoming connections from the internet. The standard solution is running a local relay on a computer that's always on. This guide provides an alternative: a cheap cloud instance that tunnels into your home network.

### Comparison of Approaches

| Approach | Monthly Cost | Pros | Cons |
|----------|-------------|------|------|
| **Local relay** (computer/Pi) | ~$0-5 electricity | Simple, low latency | Requires always-on device |
| **Lightsail + WireGuard** | $3.50 | No local hardware, reliable | Slightly higher latency |
| **AWS VPC + NAT Gateway** | ~$70+ | Native AWS integration | Expensive for hobby project |
| **Divoom Cloud API** | $0 | No infrastructure | Unreliable, rate limited |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ AWS Cloud                                                   │
│                                                             │
│  EventBridge ──► Lambda ──► API Gateway WebSocket           │
│   (1-min cron)              (wss://your-domain)             │
│                                    │                        │
│                                    ▼                        │
│                          ┌─────────────────┐                │
│                          │ Lightsail Nano  │                │
│                          │ $3.50/month     │                │
│                          │                 │                │
│                          │ • WireGuard     │                │
│                          │ • Node.js       │                │
│                          │ • Relay Service │                │
│                          └────────┬────────┘                │
└───────────────────────────────────┼─────────────────────────┘
                                    │
                            WireGuard VPN Tunnel
                              (UDP, encrypted)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Home Network                                                │
│                                                             │
│   ┌─────────────────┐              ┌─────────────────┐     │
│   │ Router          │              │ Pixoo64         │     │
│   │ (WireGuard VPN) │◄─── LAN ───► │ (HTTP API)      │     │
│   │                 │              │                 │     │
│   └─────────────────┘              └─────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required

- **AWS Account** with Lightsail access
- **Deployed signage backend** (SST stack running)
- **Router with WireGuard support** (see [Supported Routers](#supported-routers))
- **Static public IP** or **Dynamic DNS** for your home network

### Supported Routers

WireGuard server capability is required on your router. Confirmed compatible:

| Router | WireGuard Support | Notes |
|--------|------------------|-------|
| **UniFi Dream Machine** | Native (UniFi OS 3.x+) | Settings → VPN → VPN Server |
| **UniFi Dream Router** | Native | Same as UDM |
| **pfSense** | Via package | Install `wireguard` package |
| **OPNsense** | Native | VPN → WireGuard |
| **OpenWrt** | Via package | `opkg install wireguard-tools` |
| **Ubiquiti EdgeRouter** | Via package | `apt install wireguard` |
| **Synology RT series** | Native | VPN Server package |
| **ASUS (Merlin)** | Via Merlin firmware | Requires Asuswrt-Merlin |
| **MikroTik** | Native (RouterOS 7+) | WireGuard menu |
| **Linux server** | Native | Can run on any Linux box on LAN |

If your router doesn't support WireGuard, you can run WireGuard on any always-on Linux device on your network (Raspberry Pi, NAS, etc.).

---

## Step 1: Set Up WireGuard Server on Your Router

The exact steps vary by router. Here's the general process:

### General Steps

1. **Enable WireGuard Server**
   - Navigate to your router's VPN settings
   - Create a new WireGuard server/interface
   - Note the listening port (default: `51820`)

2. **Create a Client Peer**
   - Add a new peer/client for the Lightsail instance
   - Name it something memorable (e.g., `lightsail-relay`)
   - Download or copy the client configuration file

3. **Configure Firewall**
   - Ensure UDP port 51820 (or your chosen port) is open for inbound WAN traffic
   - Allow the WireGuard interface to access your LAN

### Example: UniFi Dream Machine

```
Settings → VPN → VPN Server → Create New
├── Type: WireGuard
├── Name: signage-relay
├── Port: 51820
└── Add Client → Download Config
```

### Example: pfSense

```
VPN → WireGuard → Add Tunnel
├── Enable: ✓
├── Listen Port: 51820
├── Generate Keys
└── Add Peer → Generate peer config
```

### Client Config Format

Your downloaded config should look similar to:

```ini
[Interface]
PrivateKey = <base64-private-key>
Address = 10.0.0.2/32

[Peer]
PublicKey = <router-public-key>
Endpoint = <your-public-ip-or-ddns>:51820
AllowedIPs = 0.0.0.0/0
```

**Important modifications needed:**
- Change `AllowedIPs` to your LAN subnet only (e.g., `192.168.1.0/24`)
- Add `PersistentKeepalive = 25` to maintain the connection
- Update `Endpoint` to use DDNS hostname if you have dynamic IP

---

## Step 2: Set Up Dynamic DNS (If Needed)

If your home IP changes, you need Dynamic DNS so Lightsail can always find your router.

### Free DDNS Providers

| Provider | Notes |
|----------|-------|
| [DuckDNS](https://www.duckdns.org/) | Free, simple, reliable |
| [Cloudflare](https://www.cloudflare.com/) | Free tier, requires domain |
| [No-IP](https://www.noip.com/) | Free tier with monthly confirmation |
| [Dynu](https://www.dynu.com/) | Free, supports many protocols |

### Router-Native DDNS

Many routers have built-in DDNS clients:
- **UniFi**: Settings → Internet → WAN → Dynamic DNS
- **pfSense**: Services → Dynamic DNS
- **OpenWrt**: Network → DDNS

Configure your router to update the DDNS hostname when your IP changes.

---

## Step 3: Create Lightsail Instance

### Option A: AWS Console

1. Go to [Lightsail Console](https://lightsail.aws.amazon.com/)
2. Click **Create instance**
3. Configure:
   - **Region**: Same as your SST deployment (check `sst.config.ts`)
   - **Platform**: Linux/Unix
   - **Blueprint**: Ubuntu 24.04 LTS (or latest LTS)
   - **Instance plan**: Nano ($3.50/month) - 512MB RAM, 1 vCPU
   - **Name**: `signage-relay`
4. Click **Create instance**

### Option B: AWS CLI

```bash
# Create instance
aws lightsail create-instances \
  --instance-names signage-relay \
  --availability-zone us-east-1a \
  --blueprint-id ubuntu_24_04 \
  --bundle-id nano_3_0 \
  --tags key=project,value=signage

# Wait for instance to be running
aws lightsail get-instance --instance-name signage-relay \
  --query 'instance.state.name'

# Allocate and attach static IP (recommended)
aws lightsail allocate-static-ip --static-ip-name signage-relay-ip
aws lightsail attach-static-ip \
  --static-ip-name signage-relay-ip \
  --instance-name signage-relay

# Get the static IP
aws lightsail get-static-ip --static-ip-name signage-relay-ip \
  --query 'staticIp.ipAddress' --output text
```

### Get SSH Access

Download the default SSH key:

```bash
# Download and save the key
aws lightsail download-default-key-pair \
  --query 'privateKeyBase64' --output text \
  | base64 -d > ~/.ssh/lightsail-signage.pem

chmod 600 ~/.ssh/lightsail-signage.pem

# Test SSH
ssh -i ~/.ssh/lightsail-signage.pem ubuntu@<LIGHTSAIL_IP>
```

---

## Step 4: Configure Lightsail Instance

### Run the Setup Script

SSH into your instance and run:

```bash
# One-liner setup
curl -fsSL https://raw.githubusercontent.com/<owner>/signage/main/deploy/lightsail/setup.sh \
  | sudo bash
```

Or manually:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install WireGuard
sudo apt install -y wireguard

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Create relay user and directory
sudo useradd -r -m -s /bin/bash signage
sudo mkdir -p /opt/signage-relay
sudo chown signage:signage /opt/signage-relay
```

---

## Step 5: Configure WireGuard on Lightsail

### Create the WireGuard Config

```bash
sudo nano /etc/wireguard/wg0.conf
```

Paste your client config with these modifications:

```ini
[Interface]
PrivateKey = <your-private-key-from-router-config>
Address = <your-assigned-vpn-ip>/32

[Peer]
PublicKey = <router-public-key>
Endpoint = <your-ddns-or-public-ip>:51820
AllowedIPs = <your-lan-subnet>/24
PersistentKeepalive = 25
```

**Example with typical home network:**

```ini
[Interface]
PrivateKey = abcd1234...
Address = 10.0.0.2/32

[Peer]
PublicKey = wxyz5678...
Endpoint = myhome.duckdns.org:51820
AllowedIPs = 192.168.1.0/24
PersistentKeepalive = 25
```

### Secure and Enable WireGuard

```bash
# Secure the config file
sudo chmod 600 /etc/wireguard/wg0.conf

# Enable and start WireGuard
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0

# Verify connection
sudo wg show
```

### Test Connectivity

```bash
# Ping your Pixoo
ping <PIXOO_LOCAL_IP>

# Test Pixoo API
curl -X POST http://<PIXOO_LOCAL_IP>:80/post \
  -H "Content-Type: application/json" \
  -d '{"Command":"Device/GetDeviceTime"}'
```

You should see a JSON response with the device time.

---

## Step 6: Deploy the Relay

### Option A: Using the Deploy Script (Recommended)

From your local development machine:

```bash
cd deploy/lightsail
chmod +x deploy-relay.sh

# Set your Lightsail SSH key
export LIGHTSAIL_KEY=~/.ssh/lightsail-signage.pem

# Deploy
./deploy-relay.sh <LIGHTSAIL_IP>
```

### Option B: Manual Deployment

Build locally and upload:

```bash
# Build packages
pnpm install
pnpm --filter @signage/core build
pnpm --filter @signage/relay build

# Create bundle with dependencies
cd packages/relay
npm pack
# Upload the .tgz file to Lightsail
```

On Lightsail:

```bash
cd /opt/signage-relay
sudo -u signage tar -xzf signage-relay-*.tgz --strip-components=1
sudo -u signage npm install --omit=dev
```

---

## Step 7: Configure and Start the Service

### Create Environment File

```bash
sudo tee /etc/signage-relay.env << EOF
PIXOO_IP=<YOUR_PIXOO_LOCAL_IP>
WEBSOCKET_URL=wss://<YOUR_WEBSOCKET_DOMAIN>
EOF
```

### Create systemd Service

```bash
sudo tee /etc/systemd/system/signage-relay.service << 'EOF'
[Unit]
Description=Signage Relay - Cloud to Pixoo bridge
After=network-online.target wg-quick@wg0.service
Wants=network-online.target
Requires=wg-quick@wg0.service

[Service]
Type=simple
User=signage
Group=signage
WorkingDirectory=/opt/signage-relay/packages/relay
EnvironmentFile=/etc/signage-relay.env
ExecStart=/usr/bin/node dist/cli.js --pixoo ${PIXOO_IP} --ws ${WEBSOCKET_URL}
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable signage-relay
sudo systemctl start signage-relay
```

### Verify Operation

```bash
# Check service status
sudo systemctl status signage-relay

# Watch logs
sudo journalctl -fu signage-relay
```

Expected output:

```
Starting Signage Relay...
  Pixoo: 192.168.1.xxx
  WebSocket: wss://ws.example.com

Pixoo initialized (channel 4 + GIF reset)
Connecting to WebSocket...
WebSocket connected!
Received frame: 64x64
Frame sent to Pixoo
```

---

## Maintenance

### Updating the Relay

```bash
# From your local machine
./deploy/lightsail/deploy-relay.sh <LIGHTSAIL_IP>
```

### Updating System Packages

```bash
ssh -i ~/.ssh/lightsail-signage.pem ubuntu@<LIGHTSAIL_IP>
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### Viewing Logs

```bash
# Recent logs
ssh -i ~/.ssh/lightsail-signage.pem ubuntu@<LIGHTSAIL_IP> \
  'sudo journalctl -u signage-relay -n 50'

# Follow logs live
ssh -i ~/.ssh/lightsail-signage.pem ubuntu@<LIGHTSAIL_IP> \
  'sudo journalctl -fu signage-relay'
```

### Restarting Services

```bash
# Restart relay
ssh -i ~/.ssh/lightsail-signage.pem ubuntu@<LIGHTSAIL_IP> \
  'sudo systemctl restart signage-relay'

# Restart WireGuard
ssh -i ~/.ssh/lightsail-signage.pem ubuntu@<LIGHTSAIL_IP> \
  'sudo systemctl restart wg-quick@wg0'
```

---

## Troubleshooting

### WireGuard Issues

#### No Handshake

```bash
# Check WireGuard status
sudo wg show

# If "latest handshake" is missing, the tunnel isn't established
# Verify endpoint is reachable
nc -zvu <your-ddns> 51820

# Check if your router's firewall allows inbound UDP 51820
```

#### Can't Reach LAN Devices

```bash
# Check routing table
ip route | grep wg0

# Verify AllowedIPs includes your LAN subnet
cat /etc/wireguard/wg0.conf

# Try pinging the router's LAN IP
ping 192.168.1.1
```

### Relay Issues

#### Service Won't Start

```bash
# Check service status
sudo systemctl status signage-relay

# View detailed logs
sudo journalctl -u signage-relay -n 100 --no-pager

# Test manually
cd /opt/signage-relay/packages/relay
sudo -u signage node dist/cli.js --pixoo <IP> --ws <URL>
```

#### WebSocket Connection Fails

```bash
# Test WebSocket endpoint
npm install -g wscat
wscat -c wss://<your-websocket-url>

# If it fails, check your SST deployment
cd ~/path/to/signage
pnpm sst deploy
```

#### Out of Memory During npm install

The nano instance has 512MB RAM. If npm install fails:

```bash
# Add swap space
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Retry npm install
npm install --omit=dev

# Make swap permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Alternatively, build locally and upload with dependencies included (recommended).

---

## Security Considerations

### WireGuard Key Management

- The WireGuard private key grants VPN access to your home network
- Never commit keys to version control
- Regenerate keys if they may have been exposed
- Consider using separate keys for different clients

### Firewall Recommendations

On your router:
- Only allow WireGuard port (51820) from any IP
- Restrict VPN client access to only necessary LAN subnets
- Consider allowing only the Pixoo's IP from the VPN

On Lightsail:
- Default firewall allows SSH (22) only
- No additional inbound ports needed (relay connects outbound)

### Updates

- Enable automatic security updates on Lightsail:
  ```bash
  sudo apt install unattended-upgrades
  sudo dpkg-reconfigure unattended-upgrades
  ```

---

## Cost Breakdown

| Item | Monthly Cost |
|------|-------------|
| Lightsail nano instance | $3.50 |
| Static IP (while attached) | Free |
| Data transfer (1TB included) | Free |
| Data transfer overage | $0.09/GB |
| **Total (typical)** | **$3.50** |

### Cost Optimization

- The nano instance is sufficient; don't over-provision
- Data usage is minimal (~1-2 GB/month for frame updates)
- Static IP is free while attached; delete if not using

---

## Alternative: Other Cloud Providers

This guide focuses on AWS Lightsail, but the same approach works with:

| Provider | Comparable Instance | Monthly Cost |
|----------|-------------------|--------------|
| **AWS Lightsail** | Nano | $3.50 |
| **DigitalOcean** | Basic Droplet | $4.00 |
| **Vultr** | Cloud Compute | $2.50 |
| **Hetzner** | CX22 | €3.29 (~$3.50) |
| **Oracle Cloud** | Free Tier ARM | **Free** |
| **Google Cloud** | e2-micro | Free tier eligible |

Oracle Cloud's free tier is genuinely free forever and includes 2 ARM instances, making it an excellent alternative if you want $0/month operation.

---

## Files Reference

```
deploy/lightsail/
├── README.md              # This guide
├── setup.sh               # Instance setup script
├── deploy-relay.sh        # Deployment script
└── wireguard.conf.template # WireGuard config reference
```
