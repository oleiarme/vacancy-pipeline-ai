# Applied AI Skill Taxonomy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Distinguish applied AI roles from AI training/research roles so applied AI vacancies can score as target roles while training-heavy roles stay out of `apply` by default.

**Architecture:** Extend shared skill detection with applied-AI and training/research markers, then update scorer role-title gating so applied-AI titles count as target roles while trainer/reviewer/research-style AI titles do not. Keep the existing sub-40 decision guard and drive the change from failing fixture tests.

**Tech Stack:** Node.js, JSON fixtures, regex-based scoring rules

---

### Task 1: Add failing regression fixtures

**Files:**
- Modify: `tests/fixtures/scoring_rules.json`
- Test: `tests/scoring_rules_fixtures.test.js`

**Step 1:** Add detect-skill and score-vacancy fixtures for an applied AI role and a training-heavy AI role.

**Step 2:** Run `cmd /c node tests\scoring_rules_fixtures.test.js` and verify the new expectations fail for the current implementation.

### Task 2: Extend shared AI skill detection

**Files:**
- Modify: `scripts/lib/skill_patterns.js`
- Modify: `scripts/lib/scoring_rules.js`
- Test: `tests/fixtures/scoring_rules.json`

**Step 1:** Add applied-AI markers such as `llm`, `prompt-engineering`, `embeddings`, `ai-agents`, `ai-adoption`, `mlops`.

**Step 2:** Add training/research markers such as `fine-tuning`, `deep-learning`, `annotation`, `research-ml` only where they help classification without widening false positives.

**Step 3:** Teach `classifySkillGap` the minimal adjacency rules needed for the current resume profile.

### Task 3: Update AI target-role gating in scorer

**Files:**
- Modify: `scripts/score_vacancies.js`
- Test: `tests/fixtures/scoring_rules.json`

**Step 1:** Add a helper that treats applied-AI titles as target-role matches.

**Step 2:** Exclude trainer/reviewer/red-team/research AI titles from that target-role signal.

**Step 3:** Re-run `cmd /c node tests\scoring_rules_fixtures.test.js` until green.

### Task 4: Regenerate artifacts and verify

**Files:**
- Modify: `data/scored_vacancies.json`
- Modify: `data/relevant_vacancies.json`
- Modify: `reports/relevant_vacancy_comments.md`
- Modify: `SESSION-HANDOFF.md`

**Step 1:** Run `cmd /c node scripts\score_vacancies.js`.

**Step 2:** Run `cmd /c node scripts\resume_self_check.js`.

**Step 3:** Run `cmd /c npm run check:scored` and `cmd /c npm run doctor`.

**Step 4:** Update `SESSION-HANDOFF.md` with the new state and verification evidence.
