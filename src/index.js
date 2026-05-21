export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(checkAllegroOrders(env));
	},

	async fetch(request, env) {
		if (request.method === 'GET') {
			return new Response('Allegro Order Monitor is running', { status: 200 });
		}
		
		await checkAllegroOrders(env);
		return new Response('Manual check triggered', { status: 200 });
	}
};

async function checkAllegroOrders(env) {
	try {
		const accessToken = await getAccessToken(env);
		const events = await fetchAllegroEvents(accessToken, env);
		
		if (events && events.events && events.events.length > 0) {
			await processEvents(events.events, env);
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
	
	const credentials = btoa(`${env.ALLEGRO_CLIENT_ID}:${env.ALLEGRO_CLIENT_SECRET}`);
	
	const response = await fetch('https://allegro.pl/auth/oauth/token', {
		method: 'POST',
		headers: {
			'Authorization': `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});
	
	if (!response.ok) {
		throw new Error(`Failed to get access token: ${response.status} ${await response.text()}`);
	}
	
	const data = await response.json();
	
	const tokenData = {
		access_token: data.access_token,
		expires_at: Date.now() + (data.expires_in - 60) * 1000
	};
	
	await env.ALLEGRO_KV.put('access_token', JSON.stringify(tokenData));
	
	return data.access_token;
}

async function fetchAllegroEvents(accessToken, env) {
	const lastEventId = await env.ALLEGRO_KV.get('last_event_id');
	
	let url = 'https://api.allegro.pl/order/events';
	if (lastEventId) {
		url += `?from=${lastEventId}`;
	} else {
		url += '?limit=10';
	}
	
	const response = await fetch(url, {
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'Accept': 'application/vnd.allegro.public.v1+json'
		}
	});
	
	if (!response.ok) {
		throw new Error(`Failed to fetch events: ${response.status} ${await response.text()}`);
	}
	
	return await response.json();
}

async function processEvents(events, env) {
	const processedIds = await getProcessedIds(env);
	const newEvents = [];
	
	for (const event of events) {
		if (!processedIds.has(event.id)) {
			newEvents.push(event);
			processedIds.add(event.id);
		}
	}
	
	if (newEvents.length === 0) {
		return;
	}
	
	for (const event of newEvents) {
		try {
			await sendWebhook(event, env);
			console.log(`Processed event ${event.id} of type ${event.type}`);
		} catch (error) {
			console.error(`Failed to send webhook for event ${event.id}:`, error);
		}
	}
	
	const lastEvent = events[events.length - 1];
	await env.ALLEGRO_KV.put('last_event_id', lastEvent.id);
	
	await saveProcessedIds(processedIds, env);
}

async function getProcessedIds(env) {
	const stored = await env.ALLEGRO_KV.get('processed_ids', { type: 'json' });
	return new Set(stored || []);
}

async function saveProcessedIds(processedIds, env) {
	const idsArray = Array.from(processedIds);
	const recentIds = idsArray.slice(-1000);
	await env.ALLEGRO_KV.put('processed_ids', JSON.stringify(recentIds));
}

async function sendWebhook(event, env) {
	const payload = {
		event_id: event.id,
		event_type: event.type,
		occurred_at: event.occurredAt,
		order: event.order,
		raw_event: event
	};
	
	const signature = await generateSignature(JSON.stringify(payload), env.WEBHOOK_SECRET);
	
	const response = await fetch(env.WEBHOOK_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Webhook-Signature': signature
		},
		body: JSON.stringify(payload)
	});
	
	if (!response.ok) {
		throw new Error(`Webhook failed: ${response.status}`);
	}
}

async function generateSignature(payload, secret) {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		encoder.encode(payload)
	);
	
	return Array.from(new Uint8Array(signature))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}
