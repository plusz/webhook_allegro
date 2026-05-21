# The Lion Roars Again: Real-Time Order Notifications from Allegro

Remember a month ago when I built that order notification system and had a lion roar every time a new order came in? Well, I've learned a few things since then.

## The DND Problem

In the meantime, I learned something important: I needed to set up Do Not Disturb. I don't understand how, but many parents were ordering books for their children at 1 AM or 7 in the morning! 😅

Or when I was in meetings - I added a simple modification so the iPhone shortcut wouldn't play the sound if DND was enabled or if it was outside 8 AM - 10 PM hours.

## Enter Allegro

But it turned out that orders were also coming from Allegro - Poland's most popular marketplace. To maintain a good seller rating, I need to respond quickly to customers and ship packages fast.

So I asked AI to create a new solution that would monitor Allegro orders and trigger the same webhook (the one WooCommerce calls) when a new order appears. Allegro doesn't offer push notifications, but you can make up to **9,000 requests per minute** to their API.

## Building with Cloudflare Workers

AI wrote the application quite quickly - I suggested using Cloudflare Workers and KV database - lately, this has been my favorite environment for this type of solution.

### What We Learned

We encountered a few small problems along the way:

1. **OAuth Flow Confusion** - Initially, we tried using `client_credentials` grant, which doesn't work for order endpoints. Allegro requires user context, so we switched to the **device flow** which is perfect for server-to-server applications.

2. **User-Agent Header Required** - Allegro's API requires a specific User-Agent header format: `AppName/Version (+URL)`. This is mandatory for all requests and helps Allegro identify your application.

3. **Old Events on First Run** - The first version would send webhooks for all historical events. We added logic to skip old events on initialization and only process events from the last 24 hours.

4. **Webhook Payload Format** - Make.com was rejecting our initial payload with HMAC signatures. We simplified it to just send the raw event data, which Make.com accepts perfectly.

5. **Token Caching** - We implemented proper OAuth token caching in KV storage with automatic refresh, so we're not hitting the auth endpoint unnecessarily.

## The Architecture

The solution is beautifully simple:

```
Cloudflare Cron (every 3 minutes)
    ↓
Fetch /order/events from Allegro API
    ↓
Check KV for processed event IDs
    ↓
New events?
    ↓
POST to Make.com webhook
    ↓
Update KV storage
```

**Key features:**
- Polls Allegro API every 3 minutes
- OAuth2 device flow with automatic token refresh
- Event deduplication (stores last 1000 event IDs)
- Only processes events from last 24 hours
- Skips old events on first run
- User-Agent header compliance

## Why Cloudflare Workers?

I also have a Base.com integration, but it checks orders every 10 minutes, and the Cloudflare solution is more universal - I can hook into any API.

**Benefits:**
- Free tier: 100,000 requests/day (we use ~480/day)
- KV storage for state persistence
- Cron triggers built-in
- Global edge network
- Zero cold starts

## Now the Lion Roars for Any Channel

Now the lion roars when an order comes from any channel - WooCommerce, Allegro, or any other integration I add in the future.

The code is fully open-source and ready to publish on GitHub. All sensitive data (API keys, webhook URLs) are stored in Cloudflare secrets, so the code itself is completely public.

## Try It Yourself

The complete solution is available on GitHub: [github.com/plusz/webhook_allegro](https://github.com/plusz/webhook_allegro)

**Quick start:**
```bash
# 1. Authorize with Allegro
node device-auth.js

# 2. Set secrets
wrangler secret put ALLEGRO_REFRESH_TOKEN
wrangler secret put WEBHOOK_URL

# 3. Deploy
wrangler deploy

# 4. Watch the magic
wrangler tail
```

---

**Tech Stack:**
- Cloudflare Workers (serverless)
- Cloudflare KV (state storage)
- Allegro REST API
- Make.com (webhook automation)
- OAuth2 Device Flow

**Cost:** $0/month (free tier)

**Polling frequency:** Every 3 minutes

**API usage:** ~480 requests/day (0.5% of free tier limit)

---

The best part? This pattern works for any API that doesn't support webhooks. Just poll, deduplicate, and forward. Simple, reliable, and free.

🦁 ROAR!
