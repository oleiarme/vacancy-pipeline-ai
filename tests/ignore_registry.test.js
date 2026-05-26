const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    addIgnoredVacancy,
    filterIgnoredVacancies,
    findIgnoredVacancy,
    loadIgnoreRegistry,
} = require('../scripts/lib/ignore_registry');

test('ignore registry operations', (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-registry-'));
    const registryPath = path.join(tmpDir, 'ignored_vacancies.json');

    t.after(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) {}
    });

    t.test('should load missing ignore registry as empty object', () => {
        assert.deepEqual(loadIgnoreRegistry(registryPath), {});
    });

    t.test('should find ignored vacancy by id and link', () => {
        addIgnoredVacancy(registryPath, {
            id: 'li_123',
            link: 'https://www.linkedin.com/jobs/view/123/',
            title: 'Site Reliability Engineer',
            company: 'ExampleCo',
            source: 'telegram-button',
        });

        const matchById = findIgnoredVacancy(
            { id: 'li_123', title: 'Site Reliability Engineer', company: 'ExampleCo' },
            registryPath
        );
        assert.ok(matchById);
        assert.equal(matchById.id, 'li_123');

        const matchByLink = findIgnoredVacancy(
            { link: 'https://www.linkedin.com/jobs/view/123/' },
            registryPath
        );
        assert.ok(matchByLink);
        assert.equal(matchByLink.id, 'li_123');
    });

    t.test('should filter ignored vacancies out of candidates list', () => {
        const kept = filterIgnoredVacancies([
            { id: 'li_123', title: 'Site Reliability Engineer', company: 'ExampleCo' },
            { id: 'li_456', title: 'Platform Engineer', company: 'FreshCo' },
        ], registryPath);
        assert.deepEqual(kept.map((v) => v.id), ['li_456']);
    });
});
