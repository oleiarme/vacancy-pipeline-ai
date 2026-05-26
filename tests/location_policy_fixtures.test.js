const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    buildLocationSignals,
    vacancyMatchesSignals,
} = require('../scripts/lib/location_policy');

const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'location_policy.json'), 'utf8')
);

test('location policy signals matching', (t) => {
    const signals = buildLocationSignals({
        filters: {
            locations: fixtures.signals,
        },
    });

    for (const fixture of fixtures.cases) {
        t.test(fixture.name, () => {
            const actual = vacancyMatchesSignals(fixture.vacancy, signals);
            assert.equal(actual, fixture.expected);
        });
    }
});
