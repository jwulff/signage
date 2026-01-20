#!/bin/bash
#
# Deploy Relay to Cloud Instance
#
# Bundles the relay package with dependencies and deploys to your cloud instance.
#
# Usage:
#   ./deploy-relay.sh <server-ip>
#
# Environment Variables:
#   LIGHTSAIL_KEY  - Path to SSH private key (default: ~/.ssh/lightsail-signage.pem)
#   LIGHTSAIL_USER - SSH username (default: ubuntu)
#
# Examples:
#   ./deploy-relay.sh 54.123.45.67
#   LIGHTSAIL_KEY=~/.ssh/id_rsa ./deploy-relay.sh 54.123.45.67
#   LIGHTSAIL_USER=admin LIGHTSAIL_KEY=~/.ssh/id_ed25519 ./deploy-relay.sh 10.0.0.5
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Parse arguments
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <server-ip>"
    echo ""
    echo "Environment Variables:"
    echo "  LIGHTSAIL_KEY  - Path to SSH key (default: ~/.ssh/lightsail-signage.pem)"
    echo "  LIGHTSAIL_USER - SSH username (default: ubuntu)"
    echo ""
    echo "Examples:"
    echo "  $0 54.123.45.67"
    echo "  LIGHTSAIL_KEY=~/.ssh/id_rsa $0 54.123.45.67"
    exit 1
fi

SERVER_IP="$1"
SSH_USER="${LIGHTSAIL_USER:-ubuntu}"
SSH_KEY="${LIGHTSAIL_KEY:-$HOME/.ssh/lightsail-signage.pem}"

# Expand tilde in SSH_KEY path
SSH_KEY="${SSH_KEY/#\~/$HOME}"

# Validate SSH key exists
if [[ ! -f "$SSH_KEY" ]]; then
    error "SSH key not found: $SSH_KEY"
fi

# Find repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Validate repo structure
if [[ ! -f "$REPO_ROOT/package.json" ]]; then
    error "Cannot find repo root. Expected package.json at $REPO_ROOT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying Signage Relay"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Server:   ${SSH_USER}@${SERVER_IP}"
echo "  SSH Key:  ${SSH_KEY}"
echo "  Repo:     ${REPO_ROOT}"
echo ""

# SSH options
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

# Test SSH connection
log "Testing SSH connection..."
if ! ssh $SSH_OPTS "${SSH_USER}@${SERVER_IP}" "echo 'SSH OK'" &>/dev/null; then
    error "Cannot connect to ${SSH_USER}@${SERVER_IP}"
fi

# Build packages
log "Building packages..."
cd "$REPO_ROOT"
pnpm install --silent
pnpm --filter @signage/core build
pnpm --filter @signage/relay build

# Create bundle with dependencies
log "Creating deployment bundle..."
BUNDLE_DIR=$(mktemp -d)
trap "rm -rf $BUNDLE_DIR" EXIT

mkdir -p "$BUNDLE_DIR/signage-relay/packages/core"
mkdir -p "$BUNDLE_DIR/signage-relay/packages/relay"

# Copy core package
cp -r "$REPO_ROOT/packages/core/dist" "$BUNDLE_DIR/signage-relay/packages/core/"
cp "$REPO_ROOT/packages/core/package.json" "$BUNDLE_DIR/signage-relay/packages/core/"

# Copy relay package and fix workspace reference
cp -r "$REPO_ROOT/packages/relay/dist" "$BUNDLE_DIR/signage-relay/packages/relay/"
sed 's/"@signage\/core": "workspace:\*"/"@signage\/core": "file:..\/core"/' \
    "$REPO_ROOT/packages/relay/package.json" > "$BUNDLE_DIR/signage-relay/packages/relay/package.json"

# Install dependencies locally (to avoid OOM on small instances)
log "Installing dependencies..."
cd "$BUNDLE_DIR/signage-relay/packages/relay"
npm install --omit=dev --silent 2>/dev/null

# Create tarball
cd "$BUNDLE_DIR"
tar -czf signage-relay.tar.gz signage-relay 2>/dev/null

BUNDLE_SIZE=$(du -h signage-relay.tar.gz | cut -f1)
log "Bundle created: ${BUNDLE_SIZE}"

# Upload bundle
log "Uploading to server..."
scp $SSH_OPTS "$BUNDLE_DIR/signage-relay.tar.gz" "${SSH_USER}@${SERVER_IP}:/tmp/"

# Deploy on server
log "Installing on server..."
ssh $SSH_OPTS "${SSH_USER}@${SERVER_IP}" << 'REMOTE_SCRIPT'
set -e

# Stop service if running
sudo systemctl stop signage-relay 2>/dev/null || true

# Extract bundle
sudo rm -rf /opt/signage-relay/*
cd /tmp
sudo tar -xzf signage-relay.tar.gz 2>/dev/null
sudo mv signage-relay/* /opt/signage-relay/
sudo chown -R signage:signage /opt/signage-relay

# Start service
sudo systemctl start signage-relay

echo ""
echo "Deployment complete. Checking status..."
sleep 2
sudo systemctl status signage-relay --no-pager -n 10 || true
REMOTE_SCRIPT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Deployment successful!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  View logs:"
echo "    ssh $SSH_OPTS ${SSH_USER}@${SERVER_IP} 'sudo journalctl -fu signage-relay'"
echo ""
