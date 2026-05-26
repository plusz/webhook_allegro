export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(checkAllegroOrders(env));
	},

	async fetch(request, env) {
		const url = new URL(request.url);
		
		if (request.method === 'GET') {
			return new Response('Allegro Order Monitor is running', { status: 200 });
		}
		
		// Test endpoint to verify webhook works
		if (url.pathname === '/test') {
			try {
				const testEvent = {
					id: 'test-' + Date.now(),
					type: 'READY_FOR_PROCESSING',
					occurredAt: new Date().toISOString(),
					order: {
						id: 'test-order-123',
						buyer: { login: 'test-buyer' },
						totalToPay: { amount: '99.99', currency: 'PLN' }
					}
				};
				
				await sendWebhook(testEvent, env);
				return new Response('✅ Test webhook sent successfully! Check Make.com', { status: 200 });
			} catch (error) {
				return new Response(`❌ Test webhook failed: ${error.message}`, { status: 500 });
			}
		}
		
		await checkAllegroOrders(env);
		return new Response('Manual check triggered', { status: 200 });
	}
};

async function checkAllegroOrders(env) {
	try {
		const accessToken = await getAccessToken(env);
		const result = await fetchAllegroEvents(accessToken, env);
		
		if (result && result.events && result.events.length > 0) {
			await processEvents(result.events, env, result.isFirstRun);
		} else {
			console.log('No events returned from Allegro API');
		}
		
		console.log(`Checked Allegro orders at ${new Date().toISOString()}`);
	} catch (error) {
		console.error('Error checking Allegro orders:', error);
	}
}

async function getAccessToken(env) {
	const cachedToken = await env.ALLEGRO_KV.get('access_token', { type: 'json' });
	
	if (cachedToken && cachedToken.expires_at > Date.now()) {
		return cachedToken.access_token;
	}
	
	if (!env.ALLEGRO_CLIENT_ID || !env.ALLEGRO_CLIENT_SECRET) {
		throw new Error('Missing ALLEGRO_CLIENT_ID or ALLEGRO_CLIENT_SECRET');
	}
	
	// Use refresh token from KV (auto-updated) or fall back to secret
	const kvRefreshToken = await env.ALLEGRO_KV.get('refresh_token');
	const refreshToken = kvRefreshToken || env.ALLEGRO_REFRESH_TOKEN;
	
	if (!refreshToken) {
		throw new Error('Missing ALLEGRO_REFRESH_TOKEN - run device-auth.js to authorize');
	}
	
	const credentials = btoa(`${env.ALLEGRO_CLIENT_ID}:${env.ALLEGRO_CLIENT_SECRET}`);
	
	console.log(`Refreshing OAuth token with client ID: ${env.ALLEGRO_CLIENT_ID.substring(0, 8)}...`);
	console.log(`Using refresh token from: ${kvRefreshToken ? 'KV storage' : 'secret'}`);
	
	const response = await fetch('https://allegro.pl/auth/oauth/token', {
		method: 'POST',
		headers: {
			'Authorization': `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: `grant_type=refresh_token&refresh_token=${refreshToken}`
	});
	
	if (!response.ok) {
		const errorText = await response.text();
		console.error(`OAuth refresh failed: ${response.status} - ${errorText}`);
		throw new Error(`Failed to refresh access token: ${response.status} ${errorText}`);
	}
	
	const data = await response.json();
	
	console.log(`Token scope: ${data.scope}`);
	console.log(`Token expires in: ${data.expires_in} seconds`);
	
	const newRefreshToken = data.refresh_token || env.ALLEGRO_REFRESH_TOKEN;
	
	const tokenData = {
		access_token: data.access_token,
		expires_at: Date.now() + (data.expires_in - 60) * 1000,
		refresh_token: newRefreshToken
	};
	
	await env.ALLEGRO_KV.put('access_token', JSON.stringify(tokenData));
	
	// Always save latest refresh token to KV so rotating tokens auto-update
	if (data.refresh_token) {
		await env.ALLEGRO_KV.put('refresh_token', data.refresh_token);
		console.log('Refresh token updated in KV');
	}
	
	console.log('OAuth token refreshed successfully');
	return data.access_token;
}

async function fetchAllegroEvents(accessToken, env) {
	const lastEventId = await env.ALLEGRO_KV.get('last_event_id');
	const isFirstRun = !lastEventId;
	
	let url = 'https://api.allegro.pl/order/events';
	if (lastEventId) {
		url += `?from=${lastEventId}`;
	} else {
		url += '?limit=100';
	}
	
	const response = await fetch(url, {
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'Accept': 'application/vnd.allegro.public.v1+json',
			'User-Agent': 'webhookallegro/1.0.0 (+https://github.com/plusz/webhook_allegro)'
		}
	});
	
	if (!response.ok) {
		throw new Error(`Failed to fetch events: ${response.status} ${await response.text()}`);
	}
	
	const data = await response.json();
	
	if (isFirstRun) {
		console.log('First run - initializing with latest event ID only, skipping old events');
	}
	
	return { ...data, isFirstRun };
}

async function processEvents(events, env, isFirstRun) {
	if (!events || events.length === 0) {
		console.log('No events to process');
		return;
	}
	
	const lastEvent = events[events.length - 1];
	await env.ALLEGRO_KV.put('last_event_id', lastEvent.id);
	
	if (isFirstRun) {
		console.log(`First run: Stored last event ID ${lastEvent.id}, skipped ${events.length} old events`);
		return;
	}
	
	const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
	const processedIds = await getProcessedIds(env);
	const newEvents = [];
	
	// Event types to process (only notify when payment is completed)
	const NOTIFY_EVENT_TYPES = ['READY_FOR_PROCESSING'];
	
	for (const event of events) {
		const eventTime = new Date(event.occurredAt).getTime();
		
		if (eventTime < oneDayAgo) {
			console.log(`Skipping old event ${event.id} from ${event.occurredAt}`);
			continue;
		}
		
		// Filter by event type
		if (!NOTIFY_EVENT_TYPES.includes(event.type)) {
			console.log(`Skipping event ${event.id} of type ${event.type}`);
			continue;
		}
		
		if (!processedIds.has(event.id)) {
			newEvents.push(event);
			processedIds.add(event.id);
		}
	}
	
	if (newEvents.length === 0) {
		console.log('No new events to process');
		return;
	}
	
	console.log(`Processing ${newEvents.length} new events`);
	
	for (const event of newEvents) {
		try {
			await sendWebhook(event, env);
			console.log(`Processed event ${event.id} of type ${event.type}`);
		} catch (error) {
			console.error(`Failed to send webhook for event ${event.id}:`, error);
		}
	}
	
	await saveProcessedIds(processedIds, env);
}

async function getProcessedIds(env) {
	const stored = await env.ALLEGRO_KV.get('processed_ids', { type: 'json' });
	return new Set(stored || []);
}

async function saveProcessedIds(processedIds, env) {
	const idsArray = Array.from(processedIds);
	const recentIds = idsArray.slice(-25);
	await env.ALLEGRO_KV.put('processed_ids', JSON.stringify(recentIds));
}

async function sendWebhook(event, env) {
	const payload = {
		id: event.id,
		type: event.type,
		occurredAt: event.occurredAt,
		order: event.order
	};
	
	const payloadString = JSON.stringify(payload);
	const headers = {
		'Content-Type': 'application/json'
	};
	
	// Add both authentication methods (Make.com will use x-make-apikey, WooCommerce uses HMAC)
	if (env.WEBHOOK_SECRET) {
		// Make.com API key
		headers['x-make-apikey'] = env.WEBHOOK_SECRET;
		
		// WooCommerce HMAC signature (for compatibility)
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(env.WEBHOOK_SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadString));
		const hashArray = Array.from(new Uint8Array(signature));
		const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));
		headers['X-WC-Webhook-Signature'] = hashBase64;
	}
	
	const response = await fetch(env.WEBHOOK_URL, {
		method: 'POST',
		headers: headers,
		body: payloadString
	});
	
	if (!response.ok) {
		const errorText = await response.text();
		console.error(`Webhook error response: ${errorText}`);
		throw new Error(`Webhook failed: ${response.status}`);
	}
	
	console.log(`✅ Webhook sent successfully for event ${event.id}`);
}

