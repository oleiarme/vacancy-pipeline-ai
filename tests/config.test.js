const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../scripts/lib/config');

test('config loads default paths', () => {
    assert.ok(config.ENV_PATH, 'ENV_PATH should be defined');
    assert.ok(config.AUTH_DIR, 'AUTH_DIR should be defined');
    assert.ok(config.LINKEDIN_PROFILE_DIR, 'LINKEDIN_PROFILE_DIR should be defined');
    assert.ok(config.LINKEDIN_STATE_PATH, 'LINKEDIN_STATE_PATH should be defined');
    assert.ok(config.GLASSDOOR_STATE_PATH, 'GLASSDOOR_STATE_PATH should be defined');
    assert.ok(config.GMAIL_TOKEN_PATH, 'GMAIL_TOKEN_PATH should be defined');
});
