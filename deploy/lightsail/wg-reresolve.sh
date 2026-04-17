#!/bin/bash
# Auto-heal WireGuard DDNS drift.
#
# WireGuard resolves peer hostnames only at tunnel start. When the home WAN IP
# changes, the tunnel silently dies until the endpoint is re-resolved. This
# script runs on a 60s timer, checks the peer's last handshake, and if stale,
# re-resolves the DDNS hostname and updates the peer endpoint in place.
#
# Scope: single-peer tunnel (one home router behind DDNS). Errors out if the
# interface has zero or multiple peers — per-peer DDNS config is out of scope.
#
# Install: /usr/local/sbin/wg-reresolve.sh (mode 755)
# Driven by: wg-reresolve.timer -> wg-reresolve.service
set -euo pipefail

# IFACE is coupled to After=/Requires= in wg-reresolve.service — keep in sync.
IFACE=wg0
DDNS=your-home.example.com
PORT=51820
STALE_SEC=180

# Capture the dump explicitly so a `wg show` failure (interface down, wg-tools
# missing) aborts with a clear error rather than falling through an empty
# process substitution.
if ! dump=$(wg show "$IFACE" dump); then
    echo "wg show $IFACE failed" >&2
    exit 1
fi

peers=$(printf '%s\n' "$dump" | tail -n +2)
peer_count=$(printf '%s\n' "$peers" | grep -c .)

if [[ $peer_count -ne 1 ]]; then
    echo "expected exactly 1 peer on $IFACE, found $peer_count" >&2
    exit 1
fi

IFS=$'\t' read -r pubkey _preshared endpoint _allowed handshake _rest <<< "$peers"
now=$(date +%s)
age=$(( now - handshake ))

if [[ $handshake -ne 0 && $age -le $STALE_SEC ]]; then
    exit 0
fi

ip=$(getent ahostsv4 "$DDNS" | awk 'NR==1{print $1}')
if [[ -z "$ip" ]]; then
    echo "DDNS $DDNS did not resolve; leaving endpoint $endpoint in place" >&2
    exit 1
fi

wg set "$IFACE" peer "$pubkey" endpoint "${ip}:${PORT}"
echo "re-resolved $DDNS -> ${ip}:${PORT} (was $endpoint, handshake age ${age}s)"
