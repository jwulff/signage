#!/bin/bash
#
# Signage Relay - Cloud Instance Setup Script
#
# This script sets up a fresh Ubuntu instance to run the signage relay
# with WireGuard VPN connection to your home network.
#
# Tested on:
#   - AWS Lightsail (Ubuntu 22.04/24.04)
#   - DigitalOcean Droplets
#   - Vultr Cloud Compute
#   - Oracle Cloud Free Tier
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/signage/main/deploy/lightsail/setup.sh | sudo bash
#
# Or clone and run:
#   sudo ./setup.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root (use sudo)"
fi

# Configuration
RELAY_USER="signage"
RELAY_DIR="/opt/signage-relay"
NODE_VERSION="20"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Signage Relay - Cloud Instance Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Detect OS
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
    log "Detected OS: $PRETTY_NAME"
else
    error "Cannot detect OS. This script requires Ubuntu or Debian."
fi

# Verify supported OS
if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]]; then
    error "This script only supports Ubuntu and Debian. Detected: $OS"
fi

# Update system
log "Updating system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# Install WireGuard
log "Installing WireGuard..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard

# Install Node.js
log "Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
log "Node.js $(node --version) installed"

# Create relay user
if ! id "$RELAY_USER" &>/dev/null; then
    log "Creating user: ${RELAY_USER}"
    useradd -r -m -s /bin/bash "$RELAY_USER"
else
    log "User ${RELAY_USER} already exists"
fi

# Create relay directory
log "Setting up relay directory..."
mkdir -p "$RELAY_DIR"
chown "$RELAY_USER:$RELAY_USER" "$RELAY_DIR"

# Create environment file template
if [[ ! -f /etc/signage-relay.env ]]; then
    log "Creating environment file template..."
    cat > /etc/signage-relay.env << 'EOF'
# Signage Relay Configuration
# Edit these values for your setup

# Your Pixoo's local IP address (accessible via WireGuard tunnel)
PIXOO_IP=192.168.1.XXX

# Your WebSocket API URL (from SST deployment output)
WEBSOCKET_URL=wss://ws.your-domain.com
EOF
    warn "Edit /etc/signage-relay.env with your settings"
else
    log "Environment file already exists"
fi

# Create systemd service
log "Creating systemd service..."
cat > /etc/systemd/system/signage-relay.service << 'EOF'
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

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/opt/signage-relay

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Check for WireGuard config
echo ""
if [[ ! -f /etc/wireguard/wg0.conf ]]; then
    warn "WireGuard not configured yet!"
    echo ""
    info "Create your WireGuard config:"
    echo "    sudo nano /etc/wireguard/wg0.conf"
    echo ""
    info "Paste the client config from your router, then:"
    echo "    sudo chmod 600 /etc/wireguard/wg0.conf"
    echo "    sudo systemctl enable wg-quick@wg0"
    echo "    sudo systemctl start wg-quick@wg0"
    echo ""
else
    log "WireGuard config found"
    if ! systemctl is-active --quiet wg-quick@wg0; then
        log "Enabling WireGuard tunnel..."
        systemctl enable wg-quick@wg0
        systemctl start wg-quick@wg0 || warn "WireGuard failed to start - check config"
    else
        log "WireGuard tunnel already running"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Configure WireGuard (if not done):"
echo "     sudo nano /etc/wireguard/wg0.conf"
echo "     sudo chmod 600 /etc/wireguard/wg0.conf"
echo "     sudo systemctl enable --now wg-quick@wg0"
echo ""
echo "  2. Test the VPN tunnel:"
echo "     sudo wg show"
echo "     ping <your-pixoo-ip>"
echo ""
echo "  3. Deploy relay code (from your local machine):"
echo "     ./deploy-relay.sh <this-server-ip>"
echo ""
echo "  4. Configure relay:"
echo "     sudo nano /etc/signage-relay.env"
echo ""
echo "  5. Start relay:"
echo "     sudo systemctl enable --now signage-relay"
echo "     sudo journalctl -fu signage-relay"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
