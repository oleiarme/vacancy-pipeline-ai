const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getPostedDays, parsePostedAge } = require('../scripts/lib/vacancy_utils');

const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'vacancy_utils_posted.json'), 'utf8')
);

test('vacancy utils posted age fixtures', (t) => {
    for (const fixture of fixtures) {
        t.test(fixture.name, () => {
            const parsed = parsePostedAge(fixture.raw);
            const postedDays = getPostedDays(fixture.raw);

            assert.equal(
                parsed.isUrgent,
                fixture.expectedUrgent,
                `expected urgent=${fixture.expectedUrgent}, got ${parsed.isUrgent}`
            );
            assert.equal(
                postedDays,
                fixture.expectedDays,
                `expected postedDays=${fixture.expectedDays}, got ${postedDays}`
            );
        });
    }
});
