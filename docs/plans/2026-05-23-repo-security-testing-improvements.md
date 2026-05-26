# Repo Security and Testing Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize configuration loading, relocate credentials and browser cookies outside of the git repository tree, and migrate custom assertions to Node's native `node:test` framework.

**Architecture:** We will implement a centralized configuration utility (`config.js`) that checks for `.env` and `auth/` directories at the parent sibling directory (`../`), falling back to repository-local paths if missing. We will update all modules referencing the environment or the local `auth/` directory to load paths dynamically from the config, and refactor existing test files to run natively via Node 20's `node:test` runner.

**Tech Stack:** Node.js (v20+), Playwright, `@supabase/supabase-js`

---

### Task 1: Create Centralized Config Utility

**Files:**
- Create: `scripts/lib/config.js`
- Test: `tests/config.test.js`

**Step 1: Write the failing test**
Create a basic test file `tests/config.test.js` that imports `config.js` and asserts that paths are defined:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../scripts/lib/config');

test('config loads default paths', () => {
    assert.ok(config.ENV_PATH);
    assert.ok(config.AUTH_DIR);
    assert.ok(config.LINKEDIN_PROFILE_DIR);
    assert.ok(config.LINKEDIN_STATE_PATH);
    assert.ok(config.GLASSDOOR_STATE_PATH);
    assert.ok(config.GMAIL_TOKEN_PATH);
});
```

**Step 2: Run test to verify it fails**
Run: `node tests/config.test.js` (or `node --test tests/config.test.js`)
Expected: FAIL due to missing `scripts/lib/config` module.

**Step 3: Write minimal implementation**
Create `scripts/lib/config.js`:
```javascript
const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('./env');

const ROOT = path.resolve(__dirname, '..', '..');

// 1. Resolve .env path
let envPath = path.join(ROOT, '..', '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.join(ROOT, '.env');
}

const env = loadEnvFile(envPath);

// 2. Resolve auth directory
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
```

**Step 4: Run test to verify it passes**
Run: `node --test tests/config.test.js`
Expected: PASS

**Step 5: Commit**
```bash
rtk git add scripts/lib/config.js tests/config.test.js
rtk git commit -m "feat: add centralized config utility"
```

---

### Task 2: Migrate Scrapers and Orchestrator to Centralized Config

**Files:**
- Modify: `scripts/orchestrate.js`
- Modify: `scripts/parse_linkedin.js`
- Modify: `scripts/auth_linkedin_profile.js`
- Modify: `scripts/debug_li.js`
- Modify: `scripts/lib/verify_common.js`

**Step 1: Write the failing test**
Run `npm run doctor` to verify everything starts cleanly before modifying.

**Step 2: Run test to verify it fails**
No failing test is written for this task as it refactors configuration. We will verify by running the existing static/runtime checks.

**Step 3: Write minimal implementation**
- Modify `scripts/orchestrate.js` to load `envConfig` from `require('./lib/config').env` and use paths from `config`.
- Modify `scripts/parse_linkedin.js` to replace hardcoded `../../auth/linkedin_profile` and `auth/linkedin_state.json` paths with references to `config.LINKEDIN_PROFILE_DIR` and `config.LINKEDIN_STATE_PATH`.
- Modify `scripts/auth_linkedin_profile.js` to use `config.LINKEDIN_PROFILE_DIR`.
- Modify `scripts/debug_li.js` to use `config.LINKEDIN_STATE_PATH`.
- Modify `scripts/lib/verify_common.js` to load configuration via `require('./config')`.

**Step 4: Run test to verify it passes**
Run: `npm run doctor`
Expected: PASS

**Step 5: Commit**
```bash
rtk git add scripts/orchestrate.js scripts/parse_linkedin.js scripts/auth_linkedin_profile.js scripts/debug_li.js scripts/lib/verify_common.js
rtk git commit -m "refactor: migrate scrapers and orchestrator to use centralized config paths"
```

---

### Task 3: Update package.json Auth Scripts

**Files:**
- Modify: `package.json`

**Step 1: Write the failing test**
None.

**Step 2: Run test to verify it fails**
None.

**Step 3: Write minimal implementation**
Modify `package.json` to store state in `../auth/` instead of `auth/`:
```json
    "auth:linkedin": "npx playwright codegen --channel chrome --save-storage=../auth/linkedin_state.json https://www.linkedin.com/login",
```

**Step 4: Run test to verify it passes**
Check that `npm run doctor` still passes and configuration is intact.

**Step 5: Commit**
```bash
rtk git add package.json
rtk git commit -m "chore: update linkedin codegen storage path in package.json"
```

---

### Task 4: Migrate Location Policy Tests to `node:test`

**Files:**
- Modify: `tests/location_policy_fixtures.test.js`

**Step 1: Write the failing test**
Not applicable, we are refactoring.

**Step 2: Run test to verify it fails**
None.

**Step 3: Write minimal implementation**
Rewrite `tests/location_policy_fixtures.test.js`:
```javascript
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

test('location policy signal matching', (t) => {
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
```

**Step 4: Run test to verify it passes**
Run: `node --test tests/location_policy_fixtures.test.js`
Expected: PASS with structured test details.

**Step 5: Commit**
```bash
rtk git add tests/location_policy_fixtures.test.js
rtk git commit -m "test: migrate location policy tests to node:test"
```

---

### Task 5: Migrate Remaining Tests to `node:test`

**Files:**
- Modify: `tests/scoring_rules_fixtures.test.js`
- Modify: `tests/vacancy_utils_fixtures.test.js`
- Modify: `tests/ignore_registry.test.js`
- Modify: `tests/telegram_delivery.test.js`
- Modify: `tests/telegram_formatting.test.js`
- Modify: `package.json`

**Step 1: Write the failing test**
Not applicable, we are refactoring the test harness.

**Step 2: Run test to verify it fails**
None.

**Step 3: Write minimal implementation**
Refactor the remaining tests under `tests/` to use Node's native `node:test` runner.
Update `package.json` `"doctor:quick"` and other test/verify scripts to run `node --test tests/*.test.js`.

**Step 4: Run test to verify it passes**
Run: `npm run doctor`
Expected: PASS

**Step 5: Commit**
```bash
rtk git add tests/ package.json
rtk git commit -m "test: migrate remaining test files to node:test"
```
