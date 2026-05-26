# Transferable Skill Scoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make vacancy scoring reward transferable skills based on time-to-safe-ownership so nearby data/platform roles are not undervalued by exact-tool matching.

**Architecture:** Extend the shared scoring rules with explicit transferable-skill classification, add missing data-engineering skill patterns, and let the scorer convert that classification into bounded positive credit plus clearer reasoning. Keep the resume self-check aligned by reusing the same classification logic so soft and hard gaps stay consistent across outputs.

**Tech Stack:** Node.js, plain CommonJS modules, JSON fixtures, existing repo test scripts.

---

### Task 1: Document the missing skill vocabulary in tests

**Files:**
- Modify: `tests/fixtures/scoring_rules.json`
- Test: `tests/scoring_rules_fixtures.test.js`

**Step 1: Add fixture cases for new data-platform skill detection**

Add `detectSkillCases` entries that prove the detector recognizes:
- `Airflow`
- `Astro`
- `DBT`
- `BigQuery`
- `SQL`
- `ETL` or `ELT`
- `API integrations`
- `data quality`

Use short text snippets that each contain the intended signal and avoid unrelated keywords.

**Step 2: Add fixture cases for nuanced transferable classifications**

Extend fixture coverage for:
- `airtable` as a fast-ramp tool when the resume has Python, SQL, and API/integration style experience
- `bigquery` as adjacent when the resume has GCP plus SQL
- `dbt` as adjacent when the resume has SQL plus CI/CD or pipeline discipline
- `airflow` as adjacent when the resume has Python automation plus CI/CD
- a real hard-gap negative example where the base is absent

**Step 3: Run the targeted fixture test and verify it fails**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`
Expected: FAIL because the new fixture expectations are not implemented yet.

### Task 2: Add failing behavior coverage for score outcomes

**Files:**
- Modify: `tests/scoring_rules_fixtures.test.js`
- Test: `tests/scoring_rules_fixtures.test.js`

**Step 1: Export or locally reconstruct the scoring behavior under test**

Add focused behavior checks that prove:
- familiarizable tools are not treated as hard gaps
- adjacent delivery skills add bounded positive signal instead of only removing penalties
- hard gaps still stay hard

**Step 2: Add one vacancy-style scoring regression**

Create a small synthetic vacancy/resume pairing that represents:
- Python + GCP + SQL + CI/CD resume
- vacancy asking for BigQuery + DBT + Airflow + Airtable

Assert that:
- the result is relevant or clearly above the previous strict-match baseline
- reasoning mentions adjacent or familiarizable classifications
- hard-gap tags are absent

**Step 3: Run the targeted test and verify it fails**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`
Expected: FAIL because the scorer does not yet emit the new positive credit or reasoning.

### Task 3: Implement the shared transferable-skill model

**Files:**
- Modify: `scripts/lib/skill_patterns.js`
- Modify: `scripts/lib/scoring_rules.js`
- Test: `tests/scoring_rules_fixtures.test.js`

**Step 1: Add missing skill patterns**

Extend `scripts/lib/skill_patterns.js` with explicit patterns for:
- `airflow`
- `astro`
- `dbt`
- `bigquery`
- `sql`
- `etl`
- `api integrations`
- `data quality`

Keep patterns narrow enough to avoid obvious false positives.

**Step 2: Add explicit transferable classification helpers**

In `scripts/lib/scoring_rules.js`, introduce shared helpers that classify a missing skill into:
- `direct`
- `familiarizable`
- `adjacent_short_ramp`
- `adjacent_ownership_ramp`
- `hard_gap`

Base the decision on nearby resume evidence such as Python, SQL, GCP, CI/CD, Terraform, APIs, and automation.

**Step 3: Keep the old soft-gap API compatible**

Preserve `isSoftAdjacentMissingSkill` as a wrapper over the richer classifier so existing callers still work while the scorer can use the richer detail.

**Step 4: Run the targeted fixture test**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`
Expected: some tests still fail until the scorer uses the new classifications.

### Task 4: Apply the new classifications inside vacancy scoring

**Files:**
- Modify: `scripts/score_vacancies.js`
- Modify: `scripts/resume_self_check.js`
- Test: `tests/scoring_rules_fixtures.test.js`

**Step 1: Replace plain missing-vs-soft-adjacent logic in the scorer**

Use the shared classifier to:
- continue avoiding penalties for familiarizable and adjacent skills
- add bounded positive credit for transferable skills
- preserve penalties for hard gaps only

Keep the score capped to `0..100`.

**Step 2: Improve reasoning output**

Emit reasons that distinguish:
- `Direct match`
- `Familiarizable tool`
- `Adjacent skill gap (short ramp)`
- `Adjacent skill gap (ownership ramp)`
- `Hard gap`

Do not claim exact experience that the resume does not show.

**Step 3: Align resume self-check**

Update `scripts/resume_self_check.js` so only true hard gaps remain in `missing_mandatory_requirements` for relevant vacancies.
Soft or familiarizable gaps should be surfaced separately, not treated as blockers.

**Step 4: Run the targeted fixture test**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`
Expected: PASS

### Task 5: Verify repo-level behavior and update session state

**Files:**
- Modify: `SESSION-HANDOFF.md`
- Test: `package.json`
- Test: `data/scored_vacancies.json`

**Step 1: Re-score the current vacancy dataset**

Run: `cmd /c node scripts\score_vacancies.js`
Expected: `data/scored_vacancies.json` updates without runtime errors.

**Step 2: Run the default quick verification**

Run: `cmd /c npm run doctor`
Expected: PASS

**Step 3: Spot-check the Hostelworld vacancy**

Run a local inspection for `li_4323277763`.
Expected:
- score remains relevant
- reasoning reflects transferable classification instead of strict keyword-only logic

**Step 4: Update handoff**

Record:
- the transferable-skill scoring change
- verification commands run
- any remaining scoring limitations or false-positive risks

**Step 5: Note environment limitation**

Because this workspace is not a git repository, do not include commit steps in execution.
