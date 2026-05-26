# LinkedIn Notification Job Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a second LinkedIn discovery channel from the Notifications -> Jobs tab and preserve that signal on merged vacancies as structured metadata.

**Architecture:** Extract notification-specific parsing and merge behavior into small helper modules so they can be tested without Playwright. Keep `parse_linkedin.js` as the orchestration layer that runs normal search scraping first, then a notification pass that resolves direct job links or expands search/list pages into all jobs on that page.

**Tech Stack:** Node.js, CommonJS modules, Playwright, existing JSON pipeline files, fixture-style node tests.

---

### Task 1: Add failing tests for notification signal normalization

**Files:**
- Create: `tests/linkedin_notifications_fixtures.test.js`
- Create: `tests/fixtures/linkedin_notifications.json`
- Test: `tests/linkedin_notifications_fixtures.test.js`

**Step 1: Write fixture cases for notification cards**

Cover:
- direct `/jobs/view/<id>/` target
- list/search target that should be treated as expandable discovery
- non-job notification that must be ignored
- raw Russian button labels like `??. ????????` and `??. ????????`

**Step 2: Write a failing test for normalized metadata**

Assert that normalized signals include:
- `source_variant: "notifications"`
- `linkedin_notification_signal: true`
- `linkedin_notification_type: "jobs_tab_new_opportunity"`
- `linkedin_notification_context` with raw text, posted text, and action label

**Step 3: Run the test to verify RED**

Run: `cmd /c node tests\linkedin_notifications_fixtures.test.js`
Expected: FAIL because the helper does not exist yet.

### Task 2: Add failing tests for merge enrichment

**Files:**
- Create: `tests/merge_vacancies_fixtures.test.js`
- Test: `tests/merge_vacancies_fixtures.test.js`

**Step 1: Write a failing merge case**

Assert that when the same LinkedIn vacancy appears from:
- normal search
- notification discovery

The merged row keeps one vacancy and preserves notification metadata.

**Step 2: Add a direct-field preservation check**

Assert that richer search fields like description and contacts stay intact while notification fields are added, not overwritten or dropped.

**Step 3: Run the test to verify RED**

Run: `cmd /c node tests\merge_vacancies_fixtures.test.js`
Expected: FAIL because the helper does not exist yet.

### Task 3: Implement shared notification helpers

**Files:**
- Create: `scripts/lib/linkedin_notifications.js`
- Test: `tests/linkedin_notifications_fixtures.test.js`

**Step 1: Implement notification card normalization**

Add helpers to:
- detect whether a notification is jobs-related
- normalize the raw notification card into structured signal metadata
- classify target type as `job_view` or `job_list`

**Step 2: Export a vacancy signal applier**

Implement a helper that adds notification metadata onto a vacancy object without clobbering richer existing fields.

**Step 3: Run notification tests**

Run: `cmd /c node tests\linkedin_notifications_fixtures.test.js`
Expected: PASS

### Task 4: Implement shared merge enrichment helper

**Files:**
- Create: `scripts/lib/merge_utils.js`
- Modify: `scripts/merge_vacancies.js`
- Test: `tests/merge_vacancies_fixtures.test.js`

**Step 1: Extract vacancy merge behavior**

Create a helper that merges duplicate vacancies while preserving:
- description/contacts/emails from richer source
- notification metadata from notification source
- source variant and signal flags

**Step 2: Use the helper in `merge_vacancies.js`**

Replace the current inline dedup winner logic with the shared helper.

**Step 3: Run merge tests**

Run: `cmd /c node tests\merge_vacancies_fixtures.test.js`
Expected: PASS

### Task 5: Wire notification discovery into LinkedIn parsing

**Files:**
- Modify: `scripts/parse_linkedin.js`
- Optionally modify: `scripts/parse_linkedin_test.js`
- Modify: `package.json`
- Test: `tests/linkedin_notifications_fixtures.test.js`
- Test: `tests/merge_vacancies_fixtures.test.js`

**Step 1: Add navigation and extraction helpers inside parser flow**

Implement a notification pass that:
- opens LinkedIn notifications
- switches to the jobs filter/tab using structural selectors plus text fallbacks
- extracts notification cards with job actions

**Step 2: Resolve notification targets**

If target is `/jobs/view/<id>/`, create one vacancy seed.
If target is a list/search page, open it and reuse the standard LinkedIn card extractor to collect all jobs from that page.

**Step 3: Apply notification metadata to discovered vacancies**

For every vacancy discovered through notifications, set structured fields using the shared helper.

**Step 4: Keep output backward compatible**

Continue writing to `data/vacancies_scrape_linkedin.json` as one combined LinkedIn source.
Do not change existing required fields for valid LinkedIn vacancies.

**Step 5: Add new tests to quick fixtures command if appropriate**

Update `package.json` so the new node tests run under `doctor:quick` and `test:fixtures`.

### Task 6: Verify end-to-end and update handoff

**Files:**
- Modify: `SESSION-HANDOFF.md`
- Test: `package.json`

**Step 1: Run targeted tests**

Run:
- `cmd /c node tests\linkedin_notifications_fixtures.test.js`
- `cmd /c node tests\merge_vacancies_fixtures.test.js`

Expected: PASS

**Step 2: Run syntax checks**

Run:
- `cmd /c node --check scripts\lib\linkedin_notifications.js`
- `cmd /c node --check scripts\lib\merge_utils.js`
- `cmd /c node --check scripts\parse_linkedin.js`
- `cmd /c node --check scripts\merge_vacancies.js`

Expected: PASS

**Step 3: Run repo quick verification**

Run: `cmd /c npm run doctor`
Expected: PASS

**Step 4: Update handoff**

Record the new LinkedIn notification discovery channel, tests added, and any remaining selector fragility risks.
