# Azure AKS Hard-Gap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent Azure SRE roles with explicit AKS requirements from passing resume self-check on SRE-only or lab-only Kubernetes background.

**Architecture:** Tighten shared skill detection in `scripts/lib/skill_patterns.js` and `scripts/lib/scoring_rules.js`, then validate the behavior through fixture-backed regression tests in `tests/scoring_rules_fixtures.test.js`. Refresh generated artifacts by rerunning the existing scorer/self-check pipeline after the tests pass.

**Tech Stack:** Node.js, fixture-based tests, local JSON artifacts

---

### Task 1: Add failing regression fixtures

**Files:**
- Modify: `tests/fixtures/scoring_rules.json`
- Test: `tests/scoring_rules_fixtures.test.js`

**Step 1: Write the failing test**

Add fixture coverage for:
- explicit `AKS` detection from `AKS` and `Azure Kubernetes Service`
- `azure` staying a hard gap when the resume only contains `sre`
- `aks` staying a hard gap when the resume only contains lab Kubernetes wording
- a scored Azure SRE vacancy with mandatory `azure` + `aks` failing resume self-check

**Step 2: Run test to verify it fails**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`
Expected: FAIL on the new Azure/AKS cases.

### Task 2: Implement minimal shared-skill changes

**Files:**
- Modify: `scripts/lib/skill_patterns.js`
- Modify: `scripts/lib/scoring_rules.js`

**Step 1: Write minimal implementation**

Add `aks` as an explicit skill pattern and introduce the smallest helper/classification logic needed to distinguish:
- explicit `aks`
- production Kubernetes evidence
- lab-only Kubernetes wording

Remove the `includeSreForAzure` path that turns `sre` into enough evidence for `azure`.

**Step 2: Run test to verify it passes**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`
Expected: PASS

### Task 3: Refresh scored outputs

**Files:**
- Modify: `data/scored_vacancies.json`
- Modify: `data/relevant_vacancies.json`
- Modify: `reports/relevant_vacancy_comments.md`

**Step 1: Rebuild artifacts**

Run:
- `cmd /c node scripts\score_vacancies.js`
- `cmd /c node scripts\resume_self_check.js`

Expected:
- `li_4381576966` marked with mandatory hard gaps
- relevant vacancy exports regenerated

### Task 4: Verify repo gate

**Files:**
- Modify: `SESSION-HANDOFF.md`

**Step 1: Run verification**

Run: `cmd /c npm run doctor`
Expected: PASS

**Step 2: Record handoff**

Update `SESSION-HANDOFF.md` with the Azure/AKS hard-gap refinement and the current verification results.
