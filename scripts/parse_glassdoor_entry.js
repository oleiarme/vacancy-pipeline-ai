/**
 * parse_glassdoor_entry.js - dispatch Glassdoor source (web or gmail).
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { loadEnvFile } = require('./lib/env');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const env = loadEnvFile(ENV_PATH);
const source = String(env.GLASSDOOR_SOURCE || 'web').trim().toLowerCase();

const targetScript = source === 'gmail' ? 'parse_gmail_glassdoor.js' : 'parse_glassdoor.js';
console.log(`Glassdoor source: ${source} -> ${targetScript}`);

const result = spawnSync('node', [path.join(__dirname, targetScript)], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
});

if (result.error) {
    console.error(`Failed to run ${targetScript}:`, result.error.message);
    process.exit(1);
}

process.exit(result.status || 0);

