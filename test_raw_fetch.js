const { loadEnvFile } = require('./scripts/lib/env');
const path = require('path');

const env = loadEnvFile(path.join(__dirname, '.env'));
const url = env.SUPABASE_URL;
console.log('Testing raw fetch to:', url);

(async () => {
    try {
        const res = await fetch(url);
        console.log('Fetch Status:', res.status);
    } catch (e) {
        console.error('Fetch Error:', e.message);
        console.dir(e);
    }
})();
