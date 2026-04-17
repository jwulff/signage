#!/bin/bash
# Auto-heal WireGuard DDNS drift.
#
# WireGuard resolves peer hostnames only at tunnel start. When the home WAN IP
# changes, the tunnel silently dies until the endpoint is re-resolved. This
# script runs on a 60s timer, checks the peer's last handshake, and if stale,
# re-resolves the DDNS hostname and updates the peer endpoint in place.
#
# Install: /usr/local/sbin/wg-reresolve.sh (mode 755)
# Driven by: wg-reresolve.timer -> wg-reresolve.service
set -euo pipefail

IFACE=wg0
DDNS=your-home.example.com
PORT=51820
STALE_SEC=180

now=$(date +%s)

while IFS=$'\t' read -r pubkey _preshared endpoint _allowed handshake _rx _tx _keepalive; do
    [[ -z "$pubkey" ]] && continue
    age=$(( now - handshake ))
    if [[ $handshake -eq 0 || $age -gt $STALE_SEC ]]; then
        ip=$(getent ahostsv4 "$DDNS" | awk 'NR==1{print $1}')
        if [[ -z "$ip" ]]; then
            echo "DDNS $DDNS did not resolve; leaving endpoint $endpoint in place" >&2
            exit 1
        fi
        wg set "$IFACE" peer "$pubkey" endpoint "${ip}:${PORT}"
        echo "re-resolved $DDNS -> ${ip}:${PORT} (was $endpoint, handshake age ${age}s)"
    fi
done < <(wg show "$IFACE" dump | tail -n +2)

exit 0
