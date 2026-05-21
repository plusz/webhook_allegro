# Allegro Order Monitor - Cloudflare Worker

Monitors Allegro orders via polling and sends webhooks when new events occur.

## Features

- ✅ Polls Allegro `/order/events` API every minute
- ✅ OAuth2 token management with automatic refresh
- ✅ Event deduplication using KV storage
- ✅ HMAC-SHA256 webhook signatures
- ✅ Stores last 1000 processed event IDs
- ✅ Handles new orders, payments, shipping events

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
wrangler secret put WEBHOOK_SECRET
```

### 4. Deploy

```bash
wrangler deploy
```

## Configuration

### Polling Interval

Edit `wrangler.toml` cron trigger:

```toml
# Every minute (current)
crons = ["* * * * *"]

# Every 30 seconds (requires 2 cron jobs)
crons = ["0,30 * * * *"]

# Every 10 seconds (requires 6 cron jobs)
crons = ["0,10,20,30,40,50 * * * *"]
```

**Note:** Cloudflare cron minimum is 1 minute. For sub-minute polling, use multiple cron schedules.

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

## Troubleshooting

### No events received

1. Check Allegro credentials are correct
2. Verify KV namespace ID in `wrangler.toml`
3. Check worker logs: `wrangler tail`
4. Manually trigger: `curl https://your-worker.workers.dev`

### Duplicate events

- KV stores last 1000 event IDs
- If more than 1000 events between checks, duplicates possible
- Increase storage or polling frequency

### Token errors

- OAuth token auto-refreshes 60 seconds before expiry
- Check credentials in secrets
- View logs for authentication errors

## Cost

- **Cloudflare Workers Free Tier:** 100,000 requests/day
- **KV Free Tier:** 100,000 reads/day, 1,000 writes/day
- **Current usage:** ~1,440 requests/day (well within free tier)

## API Documentation

- [Allegro Order Events](https://developer.allegro.pl/documentation/#tag/Order-management)
- [Allegro OAuth](https://developer.allegro.pl/auth/)
- [API Limits](https://developer.allegro.pl/faq)
