# Working Contract

## Purpose

This repository is a production-like personal vacancy pipeline.
Changes should optimize for continuity, verification, and low operational drift, not just local convenience.

## Definition of Done

Work in this repo is done only when all relevant items below are true:

- Code or docs are updated for the intended change.
- `npm run doctor` passes, unless the task explicitly requires a different verification path.
- `TODO.md` is updated when backlog state changed.
- `SESSION-HANDOFF.md` is updated with current actionable state.
- Completion claims are backed by fresh verification output.

## Required Verification

- Default quick gate: `npm run doctor`
- Use heavier checks only when the change touches parsing, orchestration, or external integrations.
- Do not claim success from stale or partial verification.

## Session Rules

- Start from `AGENTS.md`, this file, and `SESSION-HANDOFF.md`.
- Continue from the existing backlog when intent is clear.
- Keep work in small batches with explicit verification after each meaningful batch.
- Record current actionable state in `SESSION-HANDOFF.md`.

## Code Change Rules

- Prefer the smallest useful change that preserves pipeline continuity.
- For bugs and verifier failures: identify root cause first, then patch.
- Add or update a cheap regression check when behavior changes.
- Do not mix unrelated refactors into the same batch.

## Required Session Artifacts

- `SESSION-HANDOFF.md` is the live continuation file for the next session.
- `reports/session_notes/` stores historical run notes and should remain historical.
- `TODO.md` tracks backlog progress; do not use `SESSION-HANDOFF.md` as a second backlog.
