const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const scoreSource = fs.readFileSync(path.join(ROOT, 'scripts', 'score_vacancies.js'), 'utf8');
const hydrateSource = fs.readFileSync(path.join(ROOT, 'scripts', 'hydrate_descriptions.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('hydration and scoring contract validation', () => {
    assert.equal(scoreSource.includes("require('playwright')"), false, 'scoring script must not require playwright');
    assert.equal(scoreSource.includes('hydrateMissingDescriptions'), false, 'scoring script must not perform hydration');
    assert.equal(scoreSource.includes('sendTelegramErrorReport'), false, 'scoring script must not send telegram alerts directly');

    assert.equal(hydrateSource.includes("require('playwright')"), true, 'hydration script must require playwright');
    assert.match(packageJson.scripts['run:full'], /hydrate_descriptions\.js/);
    assert.match(packageJson.scripts['run:score:fast'], /^node scripts\/score_vacancies\.js$/);
});
