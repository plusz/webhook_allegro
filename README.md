# Allegro Order Monitor - Cloudflare Worker

Monitors Allegro orders via polling and sends webhooks when new events occur.

## Features

- ✅ Polls Allegro `/order/events` API every 3 minutes
- ✅ OAuth2 device flow with automatic token refresh
- ✅ Event deduplication using KV storage
- ✅ Only processes events from last 24 hours
- ✅ Skips old events on first run
- ✅ Stores last 1000 processed event IDs
- ✅ Handles new orders, payments, shipping events

## Quick Start

```bash
# 1. Authorize with Allegro (one-time)
node device-auth.js

# 2. Save refresh token
wrangler secret put ALLEGRO_REFRESH_TOKEN

# 3. Deploy
wrangler deploy

# 4. Monitor logs
wrangler tail
```

**📖 [Full Troubleshooting Guide](TROUBLESHOOTING.md)**

## Setup

### 1. Create KV Namespace

```bash
wrangler kv:namespace create "ALLEGRO_KV"
```

Copy the `id` from output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ALLEGRO_KV"
id = "YOUR_KV_NAMESPACE_ID_HERE"
```

### 2. Configure Secrets

Create `.dev.vars` file for local development:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your credentials:

```env
ALLEGRO_CLIENT_ID=your_allegro_client_id
ALLEGRO_CLIENT_SECRET=your_allegro_client_secret
WEBHOOK_SECRET=QU)NYt456D <c{|.+-~M;?TRc+xXThY!JHbRk,OV4.gO/yUD)F
```

### 3. Set Production Secrets

```bash
wrangler secret put ALLEGRO_CLIENT_ID
wrangler secret put ALLEGRO_CLIENT_SECRET
wrangler secret put ALLEGRO_REFRESH_TOKEN
wrangler secret put WEBHOOK_URL
```

### 4. Deploy

```bash
wrangler deploy
```

## Management

### Change Polling Interval

Edit `wrangler.toml`:

```toml
[triggers]
crons = ["*/3 * * * *"]  # Every 3 minutes (current)
```

Common schedules:
- Every minute: `["* * * * *"]`
- Every 5 minutes: `["*/5 * * * *"]`
- Every 10 minutes: `["*/10 * * * *"]`
- Every hour: `["0 * * * *"]`

After editing, deploy:
```bash
wrangler deploy
```

### Stop Worker

```bash
# Option 1: Delete completely
wrangler delete

# Option 2: Disable cron (comment out [triggers] in wrangler.toml)
wrangler deploy
```

### Start Worker

```bash
wrangler deploy
```

### View Logs

```bash
wrangler tail
```

### Manual Trigger

```bash
curl -X POST https://webhookallegro.mute-surf-eede.workers.dev
```

### API Limits

Allegro allows **9000 requests/minute** per client ID.

Current setup: **1 request/minute** = 0.01% of limit.

## Architecture

```
Cloudflare Cron (every 1 min)
    ↓
Fetch /order/events
    ↓
Check KV for processed IDs
    ↓
New events?
    ↓
POST to Make.com webhook
    ↓
Update KV storage
```

## KV Storage

- `access_token` - OAuth token with expiry
- `last_event_id` - Last processed event ID
- `processed_ids` - Array of last 1000 event IDs (deduplication)

## Webhook Payload

```json
{
  "event_id": "abc123",
  "event_type": "BOUGHT",
  "occurred_at": "2026-05-21T16:20:11Z",
  "order": {
    "id": "xyz987"
  },
  "raw_event": { ... }
}
```

Headers:
- `Content-Type: application/json`
- `X-Webhook-Signature: <hmac-sha256-hex>`

## Testing

### Manual Trigger

```bash
curl https://allegro-order-monitor.YOUR_SUBDOMAIN.workers.dev
```

### View Logs

```bash
wrangler tail
```

### Local Development

```bash
wrangler dev
```

## Event Types

Allegro order events include:

- `BOUGHT` - New order placed
- `READY_FOR_PROCESSING` - Payment confirmed
- `FULFILLMENT` - Shipping label created
- `SENT` - Package shipped
- `DELIVERED` - Package delivered

## Security

- OAuth tokens cached in KV with auto-refresh
- Webhook signatures using HMAC-SHA256
- Secrets stored in Cloudflare environment
- Event deduplication prevents duplicates

## Monitoring

Check worker logs:

```bash
wrangler tail --format pretty
```

View KV data:

```bash
wrangler kv:key get --binding=ALLEGRO_KV "last_event_id"
wrangler kv:key get --binding=ALLEGRO_KV "processed_ids"
```

## Reset / Clear Data

### Clear cached token
```bash
wrangler kv key delete --binding=ALLEGRO_KV --remote "access_token"
```

### Reset to fresh start (skip old events again)
```bash
wrangler kv key delete --binding=ALLEGRO_KV --remote "last_event_id"
```

### Clear processed event IDs
```bash
wrangler kv key delete --binding=ALLEGRO_KV --remote "processed_ids"
```

### View stored data
```bash
wrangler kv key list --binding=ALLEGRO_KV
wrangler kv key get --binding=ALLEGRO_KV "last_event_id"
```

## Troubleshooting

**📖 See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed guide**

### Quick Fixes

**No events received:**
```bash
wrangler tail  # Check logs
curl -X POST https://webhookallegro.mute-surf-eede.workers.dev  # Manual trigger
```

**OAuth errors:**
```bash
node device-auth.js  # Re-authorize
wrangler secret put ALLEGRO_REFRESH_TOKEN
```

**Webhook errors:**
- Check Make.com scenario is active
- Test webhook URL manually
- Check Make.com logs

**Worker not running:**
```bash
wrangler deployments list  # Check status
wrangler deploy  # Redeploy
```

## Cost

- **Cloudflare Workers Free Tier:** 100,000 requests/day
- **KV Free Tier:** 100,000 reads/day, 1,000 writes/day
- **Current usage:** ~1,440 requests/day (well within free tier)

## API Documentation

- [Allegro Order Events](https://developer.allegro.pl/documentation/#tag/Order-management)
- [Allegro OAuth](https://developer.allegro.pl/auth/)
- [API Limits](https://developer.allegro.pl/faq)
