const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./scripts/lib/env');
const path = require('path');

const env = loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

(async () => {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase
        .from('vacancies')
        .select('id,status')
        .limit(1);

    if (error) {
        console.error('Supabase Error:', error);
    } else {
        console.log('Supabase Success! Data:', data);
    }
})();
