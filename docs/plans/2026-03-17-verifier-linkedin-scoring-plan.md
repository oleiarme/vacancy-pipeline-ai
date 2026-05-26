# Verifier, LinkedIn Parser, and Scoring Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split verification into static/runtime layers, tighten the LinkedIn parser around fixture-backed normalization seams, and reduce policy drift in the scoring core without changing intended pipeline behavior.

**Architecture:** Keep each refactor behind an incremental compatibility layer. Start with the verifier because it is already the current backlog item and affects command shape, then stabilize the LinkedIn parser through pure helper seams and fixture coverage, then finish with scoring-core policy cleanup and boundary-case tests.

**Tech Stack:** Node.js, plain `node` tests with `assert`, Playwright, local JSON fixtures, npm scripts

---

### Task 1: Establish a clean baseline

**Files:**
- Read: `C:\Users\oleia\Documents\2026\antigravity\cv\package.json`
- Read: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\verify_pipeline.js`
- Read: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\parse_linkedin.js`
- Read: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\score_vacancies.js`

**Step 1: Run the current verification gate**

Run: `cmd /c npm run doctor`
Expected: PASS with the current test suite and verifier output green.

**Step 2: Record the command surface that must stay compatible**

Check:
- `run:sync`
- `run:telegram`
- `doctor`
- `verify:pipeline`

Expected: existing script names still work after the first verifier batch.

**Step 3: Save the batch**

Logical commit: `chore: snapshot baseline for verifier-parser-scoring refactor`

### Task 2: Split verifier internals without changing the CLI

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\verify_pipeline.js`
- Create: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\verify_static.js`
- Create: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\verify_runtime.js`
- Optional create: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\lib\verify_common.js`

**Step 1: Move shared verifier helpers into one place**

Keep:
- `getArgValue`
- `readJson`
- `toArray`
- `assert`
- `runCheck`
- `writeJsonOut`

Expected: helper extraction does not change check names or summary shape.

**Step 2: Put deterministic repo/config checks into `verify_static.js`**

Keep static-only checks for:
- `.env` time-window config
- `config/search_config.json`
- location-profile consistency in configured search URLs

Expected: `verify_static.js` should not require generated `data/*.json` artifacts.

**Step 3: Put artifact checks into `verify_runtime.js`**

Keep runtime checks for:
- `data/vacancies.json`
- `data/vacancies_mail_glassdoor.json`
- `data/scored_vacancies.json`

Expected: runtime verifier owns artifact existence, counts, ids, links, decisions, and location-policy validation over generated data.

**Step 4: Keep `verify_pipeline.js` as a compatibility wrapper**

Expected behavior:
- default path runs static then runtime
- preserves `--json-out`
- preserves exit status semantics

**Step 5: Verify**

Run:
- `cmd /c node --check scripts\verify_pipeline.js`
- `cmd /c node --check scripts\verify_static.js`
- `cmd /c node --check scripts\verify_runtime.js`
- `cmd /c npm run doctor`

Expected: all green, with no npm-script breakage.

**Step 6: Save the batch**

Logical commit: `refactor: split static and runtime verification`

### Task 3: Make the verifier split visible in npm scripts only after compatibility is proven

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\package.json`
- Optional modify: `C:\Users\oleia\Documents\2026\antigravity\cv\WORKING-CONTRACT.md`

**Step 1: Add explicit script names**

Add:
- `verify:static`
- `verify:runtime`
- `verify:all`

Keep:
- `verify:pipeline` as alias to the compatibility path or combined path

**Step 2: Decide what `doctor` should run**

Recommended:
- `doctor` keeps deterministic tests plus `verify:all` for local use
- future CI can depend on `test:fixtures` plus `verify:static`

**Step 3: Verify**

Run:
- `cmd /c npm run verify:static`
- `cmd /c npm run verify:runtime`
- `cmd /c npm run verify:all`
- `cmd /c npm run doctor`

Expected: all green and command names clear.

**Step 4: Save the batch**

Logical commit: `chore: add explicit static and runtime verifier scripts`

### Task 4: Extract pure LinkedIn normalization seams before touching selectors

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\parse_linkedin.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\lib\linkedin_jobs_home.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\lib\linkedin_notifications.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\tests\linkedin_jobs_home_fixtures.test.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\tests\linkedin_notifications_fixtures.test.js`

**Step 1: Isolate normalization from browser navigation**

Move pure work into helpers for:
- title cleanup
- id extraction
- link normalization
- company/location normalization

Expected: Playwright flow becomes thinner; helpers become fixture-testable.

**Step 2: Add one focused fixture for duplicated badge-prefixed title cleanup**

Expected: a jobs-home case that currently duplicates or pollutes the title fails first, then passes after normalization.

**Step 3: Keep selectors unchanged unless a fixture proves a parser issue**

Expected: refactor improves confidence without broad selector churn.

**Step 4: Verify**

Run:
- `cmd /c node tests\linkedin_jobs_home_fixtures.test.js`
- `cmd /c node tests\linkedin_notifications_fixtures.test.js`
- `cmd /c node --check scripts\parse_linkedin.js`
- `cmd /c npm run doctor`

Expected: fixture coverage stays green and no parser syntax regressions.

**Step 5: Save the batch**

Logical commit: `refactor: isolate linkedin normalization helpers`

### Task 5: Tighten scoring-core ownership boundaries

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\score_vacancies.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\lib\scoring_rules.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\lib\skill_patterns.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\resume_self_check.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\tests\scoring_rules_fixtures.test.js`

**Step 1: Audit which rules still live in the wrong layer**

Target split:
- `skill_patterns.js` owns signal detection vocabulary
- `scoring_rules.js` owns score composition and decision-related rules
- `score_vacancies.js` owns orchestration over vacancy lists
- `resume_self_check.js` reuses shared rules instead of drifting

**Step 2: Add failing fixtures for boundary cases before moving logic**

Minimum cases:
- applied-AI role that should stay `apply`
- trainer/reviewer/research-heavy AI role that should stay `do_not_apply_now`
- no reject decision above the existing score cap

**Step 3: Move the smallest useful chunk of policy into shared code**

Expected: behavior stable, with less duplication and less chance of future drift.

**Step 4: Verify**

Run:
- `cmd /c node tests\scoring_rules_fixtures.test.js`
- `cmd /c node hydration_scoring_contract.test.js`
- `cmd /c node --check scripts\score_vacancies.js`
- `cmd /c node --check scripts\lib\scoring_rules.js`
- `cmd /c npm run doctor`

Expected: applied-AI boundary behavior unchanged unless intentionally covered by a new fixture.

**Step 5: Save the batch**

Logical commit: `refactor: reduce scoring policy drift`

### Task 6: Final integration pass

**Files:**
- Review: `C:\Users\oleia\Documents\2026\antigravity\cv\SESSION-HANDOFF.md`
- Review: `C:\Users\oleia\Documents\2026\antigravity\cv\TODO.md`

**Step 1: Run the full local gate**

Run: `cmd /c npm run doctor`
Expected: PASS.

**Step 2: Update session artifacts**

Update:
- `SESSION-HANDOFF.md` with what landed, what remains, and exact verification commands
- `TODO.md` only if backlog state changed

**Step 3: Save the batch**

Logical commit: `docs: update handoff after verifier-parser-scoring batches`
