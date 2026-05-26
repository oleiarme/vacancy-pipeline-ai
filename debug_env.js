const { loadEnvFile } = require('./scripts/lib/env');
const path = require('path');
const env = loadEnvFile(path.join(__dirname, '.env'));
console.log('ENV keys found:', Object.keys(env).length);
console.log('SUPABASE_URL:', env.SUPABASE_URL ? 'PRESENT' : 'MISSING');
console.log('TELEGRAM_BOT_TOKEN:', env.TELEGRAM_BOT_TOKEN ? 'PRESENT' : 'MISSING');
console.log('Path used:', path.join(__dirname, '.env'));
