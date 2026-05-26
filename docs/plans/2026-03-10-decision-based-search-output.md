# Decision-Based Search Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a binary vacancy decision so search output can surface `do_not_apply_now` while default Telegram delivery sends only `decision = apply` vacancies without showing the decision label.

**Architecture:** Keep the scoring pipeline centered in `scripts/score_vacancies.js`, add a first-class `decision` field there, and propagate `relevant` from that field through resume checks, reporting, sync, and Telegram selection. Use fixture-driven tests plus one small Telegram-formatting helper extraction so the no-decision-in-Telegram rule is testable.

**Tech Stack:** Node.js, JSON fixtures, repository doctor/verification scripts

---

### Task 1: Add failing scorer fixtures for binary decision behavior

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\tests\fixtures\scoring_rules.json`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\tests\scoring_rules_fixtures.test.js`

**Step 1: Write the failing fixture cases**

Add fixture coverage for:

- a vacancy with mandatory hard gaps that must end with `decision = "do_not_apply_now"` and `relevant = false`
- a vacancy with acceptable transferable coverage that must end with `decision = "apply"` and `relevant = true`

**Step 2: Run the scorer fixture test to verify it fails**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`

Expected: FAIL because `scoreVacancy` does not yet return `decision` or cap no-apply scores.

**Step 3: Keep fixture assertions narrow**

Assert only the contract you need:

- `decision`
- `relevant`
- capped score for the no-apply case

**Step 4: Re-run the scorer fixture test**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`

Expected: still FAIL until scorer implementation is added.

**Step 5: Checkpoint**

Record that scorer contract tests now describe the desired binary decision behavior.

### Task 2: Implement `decision` and score cap in scorer

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\score_vacancies.js`

**Step 1: Implement minimal decision helpers**

Add local logic that derives:

- `hasBlockingMandatoryGap`
- `hasCoreStackMismatch`
- `decision`

Use existing data already computed in `scoreVacancy`.

**Step 2: Apply the score cap after decision is known**

Implement:

- `if (decision === "do_not_apply_now") score = Math.min(score, 39);`

**Step 3: Derive search relevance from decision**

Replace score-threshold relevance with:

- `relevant: decision === 'apply'`

Keep `score` for ranking and reasoning.

**Step 4: Return the new field in scored rows**

Add `decision` to the returned vacancy object and ensure existing fields stay backward-compatible.

**Step 5: Run the scorer fixture test**

Run: `cmd /c node tests\scoring_rules_fixtures.test.js`

Expected: PASS for the new decision assertions.

### Task 3: Align resume self-check artifacts with decision-based relevance

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\resume_self_check.js`

**Step 1: Update apply/relevance gating**

Ensure `shouldApply` prefers `decision === "apply"` and only falls back safely if needed for older data.

**Step 2: Update exported relevant artifacts**

Make `exportRelevantArtifacts` filter by actual `relevant`/`decision`, not `score >= 60`.

**Step 3: Keep comments scoped to applyable vacancies**

Continue filling `missing_mandatory_requirements` and resume comments only for vacancies that remain applyable.

**Step 4: Run resume self-check script on existing scored data**

Run: `cmd /c node scripts\resume_self_check.js`

Expected: PASS and regenerated `data/relevant_vacancies.json` / `reports/relevant_vacancy_comments.md` with decision-aligned rows.

**Step 5: Checkpoint**

Confirm relevant artifacts no longer treat capped no-apply vacancies as apply candidates.

### Task 4: Make Telegram testable without showing decision labels

**Files:**
- Create: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\lib\telegram_formatting.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\send_telegram.js`
- Create: `C:\Users\oleia\Documents\2026\antigravity\cv\tests\telegram_formatting.test.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\package.json`

**Step 1: Extract formatting helpers**

Move pure helpers from `send_telegram.js` into `scripts/lib/telegram_formatting.js`, including the line builder used for Telegram vacancy text.

**Step 2: Keep selection logic aligned with `relevant`**

Update `send_telegram.js` so its default send path selects only vacancies where `v.decision === "apply"`, `v.relevant === true`, and `resume_self_check_passed === true`, not only `score >= 60`.

**Step 3: Write a focused Telegram formatting test**

Add a test that formats a vacancy with `decision = "do_not_apply_now"` and asserts the visible Telegram text does not contain `Decision:`.

**Step 4: Wire the new test into quick verification**

Add `node tests\\telegram_formatting.test.js` to `doctor:quick` and `test:fixtures`.

**Step 5: Run the new Telegram formatting test**

Run: `cmd /c node tests\telegram_formatting.test.js`

Expected: PASS and no network calls.

### Task 5: Propagate decision-based relevance through reporting and verification

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\orchestrate.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\verify_pipeline.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\scripts\supabase_sync.js`
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\package.json`

**Step 1: Update orchestrator relevance counting**

Replace `score >= 60` relevance summaries with `v.relevant === true`, and revise summary/report labels so they no longer claim relevance is defined only by score threshold.

**Step 2: Tighten scored-data validation**

In `verify_pipeline.js`, require scored vacancies to have:

- valid `decision`
- `relevant` consistent with `decision`

**Step 3: Keep sync payload consistent**

Ensure `supabase_sync.js` upserts the new `relevant` value and, if practical, also syncs `decision` when the table supports it. If the table does not currently store `decision`, keep at least local `relevant` semantics consistent.

**Step 4: Update helper scripts**

Change `package.json` helper commands like `check:scored` so their "relevant" count uses `v.relevant === true`.

**Step 5: Run verification**

Run: `cmd /c node scripts\verify_pipeline.js`

Expected: PASS with decision-aware scored data.

### Task 6: Run full repo verification and refresh handoff

**Files:**
- Modify: `C:\Users\oleia\Documents\2026\antigravity\cv\SESSION-HANDOFF.md`

**Step 1: Run the quick gate**

Run: `cmd /c npm run doctor`

Expected: PASS.

**Step 2: Sanity-check scored output**

Run: `cmd /c npm run check:scored`

Expected: output counts "Relevant" using decision-based relevance.

**Step 3: Inspect generated artifacts**

Confirm:

- `data/scored_vacancies.json` contains `decision`
- capped no-apply vacancies are not marked relevant
- Telegram formatter test passed without adding decision labels

**Step 4: Update handoff**

Record what changed, verification commands, and any remaining rollout risks in `SESSION-HANDOFF.md`.

**Step 5: Checkpoint**

The task is complete when decision-based search output is implemented, Telegram stays decision-free, and doctor passes.

