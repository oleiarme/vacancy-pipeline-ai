# Working Contract, Session Handoff, and Doctor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight operating layer for this repository using a repo-specific working contract, a live session handoff file, and a fast default doctor command.

**Architecture:** Keep the solution intentionally small. Use two root markdown files for human-readable operating state, wire one fast verification command into `package.json`, and reference the new files from `AGENTS.md` so every future session enters through the same repo-specific workflow.

**Tech Stack:** Markdown, Node.js scripts via `package.json`, existing fixture tests and verifier.

---

### Task 1: Add the repo working contract

**Files:**
- Create: `WORKING-CONTRACT.md`
- Modify: `AGENTS.md`
- Test: `AGENTS.md`

**Step 1: Write the contract document**

Create `WORKING-CONTRACT.md` with these sections:
- Purpose
- Definition of Done
- Required Verification
- Session Rules
- Code Change Rules
- Required Session Artifacts

Content requirements:
- state that this repo is a production-like personal vacancy pipeline
- define `done` as code/doc changes + verification + `TODO.md` update when relevant + `SESSION-HANDOFF.md` update
- define `npm run doctor` as the default quick gate
- require evidence before claiming completion

**Step 2: Link the contract from `AGENTS.md`**

Add a short repo-specific instruction near the top of `AGENTS.md`:
- read `WORKING-CONTRACT.md`
- read `SESSION-HANDOFF.md`
- update `SESSION-HANDOFF.md` before ending meaningful work

**Step 3: Verify the changes**

Run: `cmd /c node --check scripts\\verify_pipeline.js`
Expected: exit code `0`

Run: `rg -n "WORKING-CONTRACT.md|SESSION-HANDOFF.md" AGENTS.md`
Expected: both filenames are referenced.

**Step 4: Commit**

```bash
git add WORKING-CONTRACT.md AGENTS.md
git commit -m "docs: add repo working contract"
```

### Task 2: Add a live session handoff file

**Files:**
- Create: `SESSION-HANDOFF.md`
- Modify: `WORKING-CONTRACT.md`
- Test: `SESSION-HANDOFF.md`

**Step 1: Write the handoff template**

Create `SESSION-HANDOFF.md` with these exact sections:
- `# Session Handoff`
- `## Current Focus`
- `## Last Completed`
- `## Next Step`
- `## Open Risks`
- `## Verification`
- `## Files Touched`
- `## Notes For Next Session`

Use short placeholder bullets only. Do not turn it into a historical log.

**Step 2: Align the contract with the handoff file**

In `WORKING-CONTRACT.md`, explicitly state:
- `SESSION-HANDOFF.md` is the live continuation file
- only current actionable state belongs there
- historical notes stay in `reports/session_notes/`

**Step 3: Verify the structure**

Run: `rg -n "^## " SESSION-HANDOFF.md`
Expected: all seven section headers appear exactly once.

**Step 4: Commit**

```bash
git add SESSION-HANDOFF.md WORKING-CONTRACT.md
git commit -m "docs: add session handoff template"
```

### Task 3: Add the fast doctor command

**Files:**
- Modify: `package.json`
- Test: `package.json`

**Step 1: Add `doctor:quick`**

Add a script named `doctor:quick` that runs:

```json
"doctor:quick": "node hydration_scoring_contract.test.js && node tests/location_policy_fixtures.test.js && node tests/scoring_rules_fixtures.test.js && node tests/vacancy_utils_fixtures.test.js && node scripts/verify_pipeline.js"
```

**Step 2: Add `doctor` alias**

Add:

```json
"doctor": "npm run doctor:quick"
```

Keep the existing test scripts intact.

**Step 3: Verify the command**

Run: `cmd /c npm run doctor`
Expected:
- fixture tests complete successfully
- `verify_pipeline.js` passes
- overall command exits `0`

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add quick doctor command"
```

### Task 4: Finalize repo entrypoints and usage docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `RUNBOOK.md`
- Modify: `TODO.md`
- Test: `WORKING-CONTRACT.md`

**Step 1: Tighten startup and shutdown guidance**

In `AGENTS.md`, add a short note that:
- startup should read `WORKING-CONTRACT.md` and `SESSION-HANDOFF.md`
- meaningful completion should update `SESSION-HANDOFF.md`

Keep this repo-specific and short; do not duplicate the entire contract.

**Step 2: Add one short runbook note**

In `RUNBOOK.md`, add a short section or note with:
- `npm run doctor` as the default quick verification path before claiming local changes are ready

**Step 3: Update the backlog**

Add a new completed item to `TODO.md` for this operating layer, or create a short note under current sprint that the repo workflow layer was added.

**Step 4: Verify docs and command discoverability**

Run: `rg -n "npm run doctor|WORKING-CONTRACT|SESSION-HANDOFF" AGENTS.md RUNBOOK.md TODO.md`
Expected: all new entrypoints are discoverable from repo docs.

**Step 5: Commit**

```bash
git add AGENTS.md RUNBOOK.md TODO.md
git commit -m "docs: wire repo workflow entrypoints"
```

### Task 5: Final verification

**Files:**
- Test: `WORKING-CONTRACT.md`
- Test: `SESSION-HANDOFF.md`
- Test: `package.json`
- Test: `AGENTS.md`

**Step 1: Run the full quick verification**

Run: `cmd /c npm run doctor`
Expected: exit code `0`

**Step 2: Run syntax verification on changed scripts if any script paths changed**

Run: `cmd /c node --check scripts\\verify_pipeline.js`
Expected: exit code `0`

**Step 3: Inspect resulting files**

Run: `rg -n "Definition of Done|Required Verification|Current Focus|Next Step|doctor:quick|npm run doctor" WORKING-CONTRACT.md SESSION-HANDOFF.md package.json RUNBOOK.md AGENTS.md`
Expected: key contract, handoff, and doctor markers are present.

**Step 4: Commit final cleanup if needed**

```bash
git add WORKING-CONTRACT.md SESSION-HANDOFF.md package.json RUNBOOK.md AGENTS.md TODO.md
git commit -m "docs: add repo workflow operating layer"
```
