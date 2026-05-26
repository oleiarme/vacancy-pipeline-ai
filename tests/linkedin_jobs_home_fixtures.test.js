const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseLinkedinJobsHomeCollectionLink, normalizeLinkedinJobsHomeAnchor } = require('../scripts/lib/linkedin_jobs_home');

const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'linkedin_jobs_home.json'), 'utf8')
);

test('linkedin jobs home normalization', (t) => {
    t.test('collection links parsing', (t2) => {
        for (const fixture of fixtures.collectionLinks) {
            t2.test(fixture.name, () => {
                const actual = parseLinkedinJobsHomeCollectionLink(fixture.entry);
                assert.deepEqual(actual, fixture.expected);
            });
        }
    });

    if (Array.isArray(fixtures.anchorEntries)) {
        t.test('anchor entries normalization', (t3) => {
            for (const fixture of fixtures.anchorEntries) {
                t3.test(fixture.name, () => {
                    const actual = normalizeLinkedinJobsHomeAnchor(fixture.entry);
                    assert.deepEqual(actual, fixture.expected);
                });
            }
        });
    }
});
