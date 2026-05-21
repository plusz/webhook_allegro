import readline from 'readline';
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
const REDIRECT_URI = 'http://localhost:8080/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error('❌ Missing ALLEGRO_CLIENT_ID or ALLEGRO_CLIENT_SECRET in .dev.vars');
	process.exit(1);
}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

function question(prompt) {
	return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
	console.log('\n🔐 Allegro OAuth - Get Refresh Token\n');
	
	const authUrl = `https://allegro.pl/auth/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
	
	console.log('1. Open this URL in your browser:\n');
	console.log(authUrl);
	console.log('\n2. Login to your Allegro seller account');
	console.log('3. Authorize the application');
	console.log('4. You will be redirected to localhost (it will fail - that\'s OK)');
	console.log('5. Copy the "code" parameter from the URL\n');
	console.log('Example: http://localhost:8080/callback?code=ABC123...\n');
	
	const code = await question('Enter the authorization code: ');
	
	console.log('\n🔄 Exchanging code for tokens...\n');
	
	const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
	
	const response = await fetch('https://allegro.pl/auth/oauth/token', {
		method: 'POST',
		headers: {
			'Authorization': `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
	});
	
	if (!response.ok) {
		const error = await response.text();
		console.error('❌ Failed:', error);
		process.exit(1);
	}
	
	const data = await response.json();
	
	console.log('✅ Success!\n');
	console.log('Access Token:', data.access_token);
	console.log('\n🔑 REFRESH TOKEN (save this!):\n');
	console.log(data.refresh_token);
	console.log('\n📝 Run this command to save it:\n');
	console.log(`wrangler secret put ALLEGRO_REFRESH_TOKEN`);
	console.log('\nThen paste the refresh token above when prompted.\n');
	
	rl.close();
}

main().catch(console.error);
