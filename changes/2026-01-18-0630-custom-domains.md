# Custom Domains for Stable URLs

*Date: 2026-01-18 0630*

## Why

API Gateway URLs changed on every deploy, requiring manual updates to documentation and causing confusion about which URL was current.

## How

Added custom domain configuration to all SST components using Route 53:

- **WebSocket API**: `ws.signage.example.com` (prod) / `ws.dev.signage.example.com` (dev)
- **HTTP API**: `api.signage.example.com` (prod) / `api.dev.signage.example.com` (dev)
- **Static Site**: `signage.example.com` (prod) / `dev.signage.example.com` (dev)

## Key Design Decisions

- **Separate dev/prod domains**: Prevents accidental testing against production
- **Subdomain pattern**: `ws.` prefix for WebSocket, `api.` prefix for HTTP, apex for web
- **Route 53 integration**: SST automatically manages ACM certificates and DNS records

## What's Next

- First deploy will take ~5 minutes for certificate validation
- URLs are now stable and won't change between deploys
