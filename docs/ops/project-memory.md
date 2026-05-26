# Project Memory

## Purpose
Single source of truth for context that must survive between sessions.
Use this file to avoid repeating mistakes and to keep decision quality stable.

## Current Priorities
1. Keep pipeline output consistent with active filter profile (location/date).
2. Catch regressions before delivery (`run:telegram`, `run:sync`) via verification gate.
3. Reduce manual checks by storing run artifacts and session notes automatically.
4. Prefer correctness and determinism over recall volume.

## Operating Rules
1. Filters are configurable; they are not hardcoded forever.
2. Any filter change requires:
   - `node scripts/score_vacancies.js --no-hydrate`
   - `npm.cmd run verify:pipeline`
3. Task is not complete until verification is green.
4. `run:telegram` and `run:sync` are guarded by `verify_pipeline`.

## Active Policy Decisions
1. Location profile source: `config/search_config.json -> filters.locations`.
2. Date profile source: `.env -> GMAIL_GLASSDOOR_TIME_WINDOW` (`today | 1d | 3d | all`).
3. Parse and merge stages must both enforce active location policy.
4. When `today` is set, Gmail parser enforces day filter using message `internalDate`.

## Key Trade-Offs
1. Strict profile matching reduces noise but may drop borderline relevant records.
2. Validation-first flow slows fast edits slightly but prevents bad outbound sends.
3. Non-blocking integrations (Supabase sync) keep pipeline moving but require issue tracking.

## Known Failure Patterns
1. PowerShell execution policy may block `npm`; use `npm.cmd` when needed.
2. LinkedIn parser may fail to launch persistent browser context (`spawn EPERM`) in some environments.
3. Supabase network/fetch errors may occur; currently treated as non-blocking in orchestrator phase 2.5.
4. Encoding inconsistencies (UTF-8 vs legacy console output) can break patch matching and log readability.

## Incident Playbook
### LinkedIn `spawn EPERM` (persistent profile launch)
1. Confirm profile dir exists and is writable:
   - `Get-ChildItem auth\\linkedin_profile -Force | Select-Object -First 20 Name,Length,LastWriteTime`
2. Check no conflicting Chrome/Playwright process is holding locks:
   - `Get-Process | Where-Object { $_.ProcessName -match 'chrome|msedge|playwright|node' }`
3. Re-auth if profile state is stale/corrupt:
   - `npm.cmd run auth:linkedin:profile`
4. Re-test parser directly:
   - `node scripts/parse_linkedin.js --today-stats`
   - `node scripts/parse_linkedin.js`
5. If still failing, run orchestrator in degraded mode and rely on other sources:
   - `node scripts/orchestrate.js --skip-parse --manual-score --skip-telegram`
6. Record incident in session notes with exact error line and timestamp.

### Supabase `fetch failed` in sync phase
1. Confirm env credentials are present:
   - `Select-String -Path .env -Pattern '^SUPABASE_URL=','^SUPABASE_KEY='`
2. Validate scored file is healthy before retry:
   - `npm.cmd run verify:pipeline`
3. Retry sync step alone:
   - `node scripts/supabase_sync.js`
4. If still failing, keep run non-blocking and proceed with local artifacts; do not hide failure.
5. Record failure in session notes and `data/runs/run_<timestamp>.json`.

## Guardrails Implemented
1. `scripts/verify_pipeline.js` validates:
   - date window configuration,
   - active location profile presence,
   - URL/profile consistency,
   - merged/mail/scored data consistency and link/id sanity.
2. Orchestrator phase 5 runs final verification and writes verification artifact.
3. Session artifacts are written automatically:
   - `data/last_run.json`
   - `data/runs/run_<timestamp>.json`
   - `reports/verification/verify_<timestamp>.json`
   - `reports/session_notes/session_<timestamp>.md`

## Commands That Should Be Muscle Memory
1. Fast quality check:
   - `npm.cmd run verify:pipeline`
2. After filter edits:
   - `node scripts/score_vacancies.js --no-hydrate`
   - `npm.cmd run verify:pipeline`
3. Full orchestrated run:
   - `node scripts/orchestrate.js`

## What Must Not Be Lost Between Sessions
1. Verification gate is mandatory before sync/telegram.
2. Filter changes require re-score + verify.
3. Parse+merge must stay aligned to one active profile.
4. Known non-blocking failures must still be visible in run artifacts.

## Update Protocol
1. Update this file after any decision that changes policy, guardrails, or failure handling.
2. Keep entries short, factual, and operational.
3. If a decision is reverted, record the reversal explicitly here.
