const test = require('node:test');
const assert = require('node:assert/strict');
const { extractRetryAfterSeconds } = require('../scripts/lib/telegram_delivery');

test('telegram delivery retry_after extraction', () => {
    assert.equal(
        extractRetryAfterSeconds('{"ok":false,"error_code":429,"description":"Too Many Requests: retry after 37","parameters":{"retry_after":37}}'),
        37,
        'should read retry_after from Telegram JSON payload'
    );
    assert.equal(
        extractRetryAfterSeconds('Too Many Requests: retry after 12'),
        12,
        'should parse retry_after from plain text fallback'
    );
    assert.equal(
        extractRetryAfterSeconds('something else'),
        null,
        'should return null when retry_after is absent'
    );
});
