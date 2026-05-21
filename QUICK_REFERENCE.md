# Quick Reference Card

## Essential Commands

### Monitor
```bash
wrangler tail                    # View real-time logs
wrangler deployments list        # Check deployment status
```

### Control
```bash
wrangler deploy                  # Deploy/update worker
wrangler delete                  # Stop and delete worker
curl -X POST https://webhookallegro.mute-surf-eede.workers.dev  # Manual trigger
```

### Secrets
```bash
wrangler secret list             # List all secrets
wrangler secret put SECRET_NAME  # Update a secret
```

### KV Storage
```bash
wrangler kv key list --binding=ALLEGRO_KV                        # List all keys
wrangler kv key get --binding=ALLEGRO_KV "last_event_id"         # View key
wrangler kv key delete --binding=ALLEGRO_KV --remote "KEY_NAME"  # Delete key
```

---

## Change Schedule

Edit `wrangler.toml`:
```toml
[triggers]
crons = ["*/3 * * * *"]  # Change this line
```

Then: `wrangler deploy`

---

## Fresh Start

```bash
# 1. Clear all data
wrangler kv key delete --binding=ALLEGRO_KV --remote "access_token"
wrangler kv key delete --binding=ALLEGRO_KV --remote "last_event_id"
wrangler kv key delete --binding=ALLEGRO_KV --remote "processed_ids"

# 2. Redeploy
wrangler deploy
```

---

## Re-authorize Allegro

```bash
node device-auth.js
wrangler secret put ALLEGRO_REFRESH_TOKEN
```

---

## Emergency Stop

```bash
wrangler delete
```

---

## Files

- `src/index.js` - Main worker code
- `wrangler.toml` - Configuration (cron schedule, KV binding)
- `device-auth.js` - Get Allegro refresh token
- `.dev.vars` - Local development secrets (not deployed)
- `README.md` - Full documentation
- `TROUBLESHOOTING.md` - Detailed troubleshooting guide

---

## URLs

- **Worker:** https://webhookallegro.mute-surf-eede.workers.dev
- **Webhook:** (stored in WEBHOOK_URL secret)
- **Allegro API:** https://api.allegro.pl/order/events
- **Dashboard:** https://dash.cloudflare.com

---

## KV Keys

- `access_token` - Cached OAuth token (auto-refreshed)
- `last_event_id` - Last processed event ID (persistent)
- `processed_ids` - Last 1000 event IDs (deduplication)

---

## Cron Syntax

```
*/3 * * * *  = Every 3 minutes
*/5 * * * *  = Every 5 minutes
*/10 * * * * = Every 10 minutes
0 * * * *    = Every hour
0 9 * * *    = Every day at 9 AM
```

Format: `minute hour day month weekday`
