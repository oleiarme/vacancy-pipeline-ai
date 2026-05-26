# Closed Vacancy Detection & Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect expired/closed job postings on LinkedIn and Glassdoor during hydration or enrichment, flag them in the database with `closed: true`, and evaluate them as `decision = 'do_not_apply_now'` with `score = 0` to prevent them from reaching Telegram.

**Architecture:** Update page evaluation blocks in hydration and detail modules to run regex searches on page-level body text. Enhance the scoring engine to identify `closed === true` properties and override scores/decisions. Add a regression test case to unit fixtures.

**Tech Stack:** Node.js, Playwright, Node assert

---

### Task 1: Add unit tests for closed vacancy scoring

**Files:**
- Modify: `tests/fixtures/scoring_rules.json`

**Step 1: Write the failing test case**
Add a case under `scoreVacancyCases` in `tests/fixtures/scoring_rules.json` specifying that a vacancy with `"closed": true` is evaluated to `do_not_apply_now`, `relevant: false`, and a score of `0`.

**Step 2: Run test to verify it fails**
Run: `node tests/scoring_rules_fixtures.test.js`
Expected: FAIL because `score_vacancies.js` does not yet handle `closed: true` and scores it normally.

---

### Task 2: Implement scoring override for closed vacancies

**Files:**
- Modify: `scripts/score_vacancies.js`

**Step 1: Implement minimal code**
At the beginning of `scoreVacancy(vacancy, resumeSkills, resumeText)`, check if `vacancy.closed === true`. If so, override:
- `score = 0`
- `decision = 'do_not_apply_now'`
- `relevant = false`
- Add reason and tags.

**Step 2: Run test to verify it passes**
Run: `node tests/scoring_rules_fixtures.test.js`
Expected: PASS

---

### Task 3: Update description hydration script to scan for closed banner text

**Files:**
- Modify: `scripts/hydrate_descriptions.js`

**Step 1: Write text check logic**
Define `CLOSED_PATTERNS` regex array in `hydrate_descriptions.js`. Inside the page loading block:
Scan `document.body.innerText` for matches of `CLOSED_PATTERNS`.
If matched, set `vacancy.closed = true`.

**Step 2: Syntax verification**
Run: `node --check scripts/hydrate_descriptions.js`
Expected: PASS with no syntax errors.

---

### Task 4: Update LinkedIn job detail enrichment to scan for closed banner text

**Files:**
- Modify: `scripts/lib/linkedin/job_details.js`

**Step 1: Write text check logic**
Import or define the regex check in `extractJobFromViewPage` or the page evaluation block in `enrichVacanciesWithDetails`.
If matched, return `closed: true`.
Update `parseEnrichmentResults` to set `job.closed = Boolean(details.closed)`.

**Step 2: Syntax verification**
Run: `node --check scripts/lib/linkedin/job_details.js`
Expected: PASS with no syntax errors.

---

### Task 5: Verify the full pipeline and check the target Cloudflare vacancy

**Files:**
- Modify: `data/vacancies.json`

**Step 1: Mark vacancy as closed and re-run scoring**
Inspect `data/vacancies.json`. Find `li_4358868720`, manually append `"closed": true` to it.
Run: `node scripts/score_vacancies.js`
Verify that in `data/scored_vacancies.json`, `li_4358868720` has score `0`, relevant `false`, decision `'do_not_apply_now'`.

**Step 2: Run doctor checklist**
Run: `npm run doctor`
Expected: PASS
