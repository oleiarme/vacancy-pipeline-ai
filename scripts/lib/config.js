const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('./env');

const ROOT = path.resolve(__dirname, '..', '..');

// 1. Resolve .env path (checks parent directory first)
let envPath = path.join(ROOT, '..', '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.join(ROOT, '.env');
}

const env = loadEnvFile(envPath);

// 2. Resolve auth directory (checks parent directory first)
let authDir = path.join(ROOT, '..', 'auth');
if (!fs.existsSync(authDir)) {
    authDir = path.join(ROOT, 'auth');
}

module.exports = {
    ROOT,
    ENV_PATH: envPath,
    AUTH_DIR: authDir,
    LINKEDIN_PROFILE_DIR: path.join(authDir, 'linkedin_profile'),
    LINKEDIN_STATE_PATH: path.join(authDir, 'linkedin_state.json'),
    GLASSDOOR_STATE_PATH: path.join(authDir, 'glassdoor_state.json'),
    GMAIL_TOKEN_PATH: path.join(authDir, 'gmail_token.json'),
    env,
};
