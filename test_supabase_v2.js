const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./scripts/lib/env');
const path = require('path');

const env = loadEnvFile(path.join(__dirname, '.env'));
console.log('Using URL:', env.SUPABASE_URL);
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

(async () => {
    try {
        const { data, error } = await supabase
            .from('vacancies')
            .select('id,status')
            .limit(1);

        if (error) {
            console.error('Supabase Error Code:', error.code);
            console.error('Supabase Error Message:', error.message);
            console.error('Full Error:', JSON.stringify(error, null, 2));
        } else {
            console.log('Supabase Success!');
        }
    } catch (e) {
        console.error('Caught Exception:', e.message);
        console.error('Exception Code:', e.code);
        console.dir(e);
    }
})();
