import { readFileSync } from 'fs';

// Load .dev.vars file
try {
	const envFile = readFileSync('.dev.vars', 'utf-8');
	envFile.split('\n').forEach(line => {
		const [key, ...values] = line.split('=');
		if (key && values.length) {
			process.env[key.trim()] = values.join('=').trim();
		}
	});
} catch (error) {
	console.error('❌ Could not read .dev.vars file');
	console.log('\nCreate a .dev.vars file with:');
	console.log('ALLEGRO_CLIENT_ID=your_client_id');
	console.log('ALLEGRO_CLIENT_SECRET=your_client_secret\n');
	process.exit(1);
}

const CLIENT_ID = process.env.ALLEGRO_CLIENT_ID;
const CLIENT_SECRET = process.env.ALLEGRO_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error('❌ Missing ALLEGRO_CLIENT_ID or ALLEGRO_CLIENT_SECRET in .dev.vars');
	process.exit(1);
}

async function deviceAuth() {
	console.log('\n🔐 Allegro Device Flow Authorization\n');
	
	const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
	
	const deviceResponse = await fetch(`https://allegro.pl/auth/oauth/device?client_id=${CLIENT_ID}`, {
		method: 'POST',
		headers: {
			'Authorization': `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	});
	
	if (!deviceResponse.ok) {
		const error = await deviceResponse.text();
		console.error('❌ Failed to get device code:', error);
		process.exit(1);
	}
	
	const deviceData = await deviceResponse.json();
	
	console.log('📱 Go to this URL and enter the code:\n');
	console.log(`   ${deviceData.verification_uri_complete}`);
	console.log('\n   Or visit: https://allegro.pl/skojarz-aplikacje');
	console.log(`   And enter code: ${deviceData.user_code}\n`);
	console.log('⏳ Waiting for authorization...\n');
	
	const interval = (deviceData.interval || 5) * 1000;
	const expiresAt = Date.now() + (deviceData.expires_in * 1000);
	
	while (Date.now() < expiresAt) {
		await new Promise(resolve => setTimeout(resolve, interval));
		
		const tokenResponse = await fetch('https://allegro.pl/auth/oauth/token', {
			method: 'POST',
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=${deviceData.device_code}`
		});
		
		if (tokenResponse.status === 200) {
			const tokens = await tokenResponse.json();
			
			console.log('✅ Authorization successful!\n');
			console.log('🔑 REFRESH TOKEN (save this!):\n');
			console.log(tokens.refresh_token);
			console.log('\n📝 Run this command to save it:\n');
			console.log('wrangler secret put ALLEGRO_REFRESH_TOKEN');
			console.log('\nThen paste the refresh token above when prompted.\n');
			process.exit(0);
		} else if (tokenResponse.status === 400) {
			const error = await tokenResponse.json();
			if (error.error === 'authorization_pending') {
				process.stdout.write('.');
				continue;
			} else if (error.error === 'slow_down') {
				console.log('\n⚠️  Slowing down polling...');
				await new Promise(resolve => setTimeout(resolve, 5000));
				continue;
			} else {
				console.error('\n❌ Error:', error);
				process.exit(1);
			}
		}
	}
	
	console.log('\n❌ Authorization timeout. Please try again.');
	process.exit(1);
}

deviceAuth().catch(console.error);
