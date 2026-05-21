# Troubleshooting Guide

## Quick Commands

### View Logs
```bash
wrangler tail
```

### Manual Trigger
```bash
curl -X POST https://webhookallegro.mute-surf-eede.workers.dev
```

### Check Worker Status
```bash
wrangler deployments list
```

---

## Start / Stop Worker

### Stop Worker (Disable Cron)
```bash
# Option 1: Delete the worker completely
wrangler delete

# Option 2: Deploy without cron triggers
# Edit wrangler.toml and comment out the [triggers] section:
# [triggers]
# crons = ["*/3 * * * *"]
wrangler deploy
```

### Start Worker (Enable Cron)
```bash
# Uncomment [triggers] section in wrangler.toml
wrangler deploy
```

### Pause Temporarily
There's no "pause" command. Options:
1. Delete the worker: `wrangler delete`
2. Deploy with cron disabled (comment out `[triggers]` in `wrangler.toml`)

---

## Change Cron Schedule

Edit `wrangler.toml`:

```toml
[triggers]
crons = ["*/3 * * * *"]  # Every 3 minutes
```

### Common Schedules

```toml
# Every minute
crons = ["* * * * *"]

# Every 5 minutes
crons = ["*/5 * * * *"]

# Every 10 minutes
crons = ["*/10 * * * *"]

# Every 30 minutes
crons = ["*/30 * * * *"]

# Every hour
crons = ["0 * * * *"]

# Every day at 9 AM
crons = ["0 9 * * *"]
```

After editing, deploy:
```bash
wrangler deploy
```

---

## Reset / Clear Data

### Clear All KV Data (Fresh Start)
```bash
# Delete cached OAuth token
wrangler kv key delete --binding=ALLEGRO_KV --remote "access_token"

# Delete last event ID (will re-initialize on next run)
wrangler kv key delete --binding=ALLEGRO_KV --remote "last_event_id"

# Delete processed event IDs
wrangler kv key delete --binding=ALLEGRO_KV --remote "processed_ids"
```

### View KV Data
```bash
# List all keys
wrangler kv key list --binding=ALLEGRO_KV

# View specific key
wrangler kv key get --binding=ALLEGRO_KV "last_event_id"
wrangler kv key get --binding=ALLEGRO_KV "access_token"
wrangler kv key get --binding=ALLEGRO_KV "processed_ids"
```

---

## Common Issues

### Issue: "Error: Missing ALLEGRO_REFRESH_TOKEN"

**Cause:** Refresh token not set or expired.

**Solution:**
```bash
# Re-authorize with Allegro
node device-auth.js

# Save the new refresh token
wrangler secret put ALLEGRO_REFRESH_TOKEN
```

---

### Issue: "403 EMPTY_USER_ID"

**Cause:** Using client_credentials instead of user token.

**Solution:**
1. Make sure you created the app with **device_code** grant type
2. Re-run device authorization:
   ```bash
   node device-auth.js
   wrangler secret put ALLEGRO_REFRESH_TOKEN
   ```
3. Clear old token:
   ```bash
   wrangler kv key delete --binding=ALLEGRO_KV --remote "access_token"
   ```

---

### Issue: "Webhook failed: 400"

**Cause:** Make.com webhook rejecting payload.

**Solution:**
1. Check Make.com scenario is active
2. Test webhook manually:
   ```bash
   curl -X POST https://hook.eu2.make.com/YOUR_WEBHOOK_URL \
     -H "Content-Type: application/json" \
     -d '{"id":"test","type":"BOUGHT","occurredAt":"2026-05-21T12:00:00Z","order":{"id":"123"}}'
   ```
3. Check Make.com logs for error details

---

### Issue: "401 Unauthorized" from Allegro

**Cause:** Invalid or expired credentials.

**Solution:**
```bash
# Check secrets are set
wrangler secret list

# Re-set credentials
wrangler secret put ALLEGRO_CLIENT_ID
wrangler secret put ALLEGRO_CLIENT_SECRET
wrangler secret put ALLEGRO_REFRESH_TOKEN
```

---

### Issue: "429 Too Many Requests"

**Cause:** Hitting Allegro API rate limit (9000 req/min).

**Solution:**
1. Increase cron interval (e.g., every 5 minutes instead of 3)
2. Check logs for unexpected loops
3. This shouldn't happen with normal usage (20 req/hour)

---

### Issue: Worker Not Running

**Check deployment:**
```bash
wrangler deployments list
```

**Check cron triggers:**
```bash
wrangler deployments view
```

**Redeploy:**
```bash
wrangler deploy
```

---

### Issue: Receiving Old Events

**Cause:** First run or `last_event_id` was deleted.

**Solution:**
This is expected on first run. The worker will:
1. Fetch last 100 events
2. Store the latest event ID
3. Skip sending webhooks for old events
4. Only process new events going forward

To force re-initialization:
```bash
wrangler kv key delete --binding=ALLEGRO_KV --remote "last_event_id"
```

---

### Issue: Duplicate Events

**Cause:** `processed_ids` storage was cleared or exceeded 1000 events.

**Solution:**
1. Check processed IDs:
   ```bash
   wrangler kv key get --binding=ALLEGRO_KV "processed_ids"
   ```
2. If needed, clear and let it rebuild:
   ```bash
   wrangler kv key delete --binding=ALLEGRO_KV --remote "processed_ids"
   ```

---

## Update Secrets

```bash
# Update Allegro credentials
wrangler secret put ALLEGRO_CLIENT_ID
wrangler secret put ALLEGRO_CLIENT_SECRET
wrangler secret put ALLEGRO_REFRESH_TOKEN

# Update webhook URL
wrangler secret put WEBHOOK_URL
```

---

## View All Secrets
```bash
wrangler secret list
```

---

## Complete Reset (Nuclear Option)

```bash
# 1. Delete the worker
wrangler delete

# 2. Delete KV namespace
wrangler kv namespace delete --namespace-id=d234177b950347c8aa525dba03778d81

# 3. Create new KV namespace
wrangler kv namespace create "ALLEGRO_KV"

# 4. Update wrangler.toml with new KV namespace ID

# 5. Re-authorize
node device-auth.js

# 6. Set all secrets
wrangler secret put ALLEGRO_CLIENT_ID
wrangler secret put ALLEGRO_CLIENT_SECRET
wrangler secret put ALLEGRO_REFRESH_TOKEN
wrangler secret put WEBHOOK_SECRET

# 7. Deploy
wrangler deploy
```

---

## Monitoring

### Real-time Logs
```bash
wrangler tail --format pretty
```

### Check Last Run
```bash
wrangler kv key get --binding=ALLEGRO_KV "last_event_id"
```

### Check Token Expiry
```bash
wrangler kv key get --binding=ALLEGRO_KV "access_token"
```

---

## Useful Debugging

### Test OAuth Flow
```bash
node device-auth.js
```

### Test Webhook Manually
```bash
curl -X POST https://webhookallegro.mute-surf-eede.workers.dev
wrangler tail
```

### Check Allegro API Directly
```bash
# Get access token first (from KV or device-auth.js)
TOKEN="your_access_token_here"

curl -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/vnd.allegro.public.v1+json" \
     -H "User-Agent: webhookallegro/1.0.0 (+https://github.com/plusz/webhook_allegro)" \
     "https://api.allegro.pl/order/events?limit=5"
```

---

## Emergency Stop

If something goes wrong and you need to stop immediately:

```bash
# Delete the worker
wrangler delete

# Or disable cron and redeploy
# Edit wrangler.toml, comment out [triggers] section, then:
wrangler deploy
```

---

## Support

- **Allegro API Docs:** https://developer.allegro.pl/documentation/
- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/
- **Wrangler CLI Docs:** https://developers.cloudflare.com/workers/wrangler/

---

## Health Check

Run this to verify everything is working:

```bash
# 1. Check deployment
wrangler deployments list

# 2. Check secrets
wrangler secret list

# 3. Check KV data
wrangler kv key list --binding=ALLEGRO_KV

# 4. View recent logs
wrangler tail

# 5. Manual trigger
curl -X POST https://webhookallegro.mute-surf-eede.workers.dev
```
