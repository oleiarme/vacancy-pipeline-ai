const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getVacancyDedupKey, parsePostedAge, parseReasonsFromReasoning } = require('./lib/vacancy_utils');

const ROOT = path.resolve(__dirname, '..');

function run(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
    } catch (error) {
        console.error(`FAIL: ${name}`);
        console.error(error.message);
        process.exitCode = 1;
    }
}

run('dedup key should preserve records with empty title/company by using id/link fallback', () => {
    const a = { id: 'a1', title: '', company: '', link: 'https://a.example' };
    const b = { id: 'b2', title: null, company: null, link: 'https://b.example' };
    const c = { id: '', title: null, company: null, link: 'https://c.example' };

    const keys = new Set([
        getVacancyDedupKey(a),
        getVacancyDedupKey(b),
        getVacancyDedupKey(c),
    ]);

    assert.strictEqual(keys.size, 3, 'Expected unique keys for fallback dedup cases');
});

run('posted parsing should be safe for null/empty and detect urgency for 5 days/hours', () => {
    assert.strictEqual(parsePostedAge(null).isUrgent, false);
    assert.strictEqual(parsePostedAge('').isUrgent, false);
    assert.strictEqual(parsePostedAge('5 days ago').isUrgent, true);
    assert.strictEqual(parsePostedAge('6 days ago').isUrgent, false);
    assert.strictEqual(parsePostedAge('12h').isUrgent, true);
});

run('reasoning should be convertible to reasons[]', () => {
    const reasons = parseReasonsFromReasoning('+10 A, +20 B, -5 C');
    assert.deepStrictEqual(reasons, ['+10 A', '+20 B', '-5 C']);
});

run('required runtime files should exist', () => {
    const required = [
        'scripts/merge_vacancies.js',
        'scripts/send_telegram.js',
        'scripts/supabase_sync.js',
        'scripts/resume_self_check.js',
        'scripts/parse_glassdoor.js',
        'scripts/parse_linkedin.js',
        'config/supabase_schema.sql',
    ];

    required.forEach((relPath) => {
        const fullPath = path.join(ROOT, relPath);
        assert.ok(fs.existsSync(fullPath), `Missing file: ${relPath}`);
    });
});

if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
}
