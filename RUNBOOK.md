# Local Runbook

## Verified Entry Checks
Run these first in this repo:

```bash
npm run doctor
```

What this proves:
- fixture tests pass
- scoring rules are consistent
- merged/scored data contracts are sane
- current repo config matches the active location profile

## Verified Operating Modes

### 1. Local Core Pipeline
Use this when you want fresh vacancies, scoring, reports, and verification, but you do not want Telegram to be the success gate.

```bash
node scripts/orchestrate.js --skip-telegram
```

What this does:
- parses Glassdoor
- parses LinkedIn
- merges vacancies
- hydrates missing descriptions
- scores vacancies
- runs resume self-check
- runs non-blocking Supabase sync if configured
- writes reports and verification artifacts

Notes:
- `supabase_sync.js` is non-blocking in orchestrator. A sync failure does not invalidate local reports.
- `--skip-telegram` is the safest default local mode when you are validating data and scoring.
- Live verified on 2026-03-09: orchestrator completed end-to-end and wrote fresh artifacts.

### 2. Full Pipeline Including Telegram
Use this only when Supabase and Telegram credentials/connectivity are expected to work.

```bash
node scripts/orchestrate.js
```

Notes:
- Telegram sending currently depends on reading statuses from Supabase.
- If Supabase or Telegram is unavailable, local artifacts can still be valid even though orchestrator reports issues in later phases.

### 3. Fast Re-run Without Fresh Parsing
Use this after scoring/config changes when the scraped vacancy files are already fresh.

```bash
node scripts/orchestrate.js --skip-parse --skip-telegram
```

### 4. Manual Scoring Path
Use this when you want explicit control over scoring before orchestrator runs.

```bash
node scripts/hydrate_descriptions.js
node scripts/score_vacancies.js
node scripts/resume_self_check.js
node scripts/orchestrate.js --skip-parse --manual-score --skip-telegram
```

## LinkedIn Parsing

### Standard LinkedIn Parse

```bash
node scripts/parse_linkedin.js
```

Requirements:
- valid LinkedIn auth in `auth/linkedin_profile` when persistent profile mode is enabled
- a real browser-capable environment
- internet access

Observed live behavior on 2026-03-09:
- the parser completed successfully outside sandbox
- it processed normal search discovery
- it detected at least one notifications-based job signal
- it saved fresh `data/vacancies_scrape_linkedin.json`

### LinkedIn Notification Job Signals
The parser now has a second discovery channel from LinkedIn notifications.
When it resolves a notification to one or more jobs, vacancies may carry:

- `source_variant: "notifications"`
- `linkedin_notification_signal: true`
- `linkedin_notification_type: "jobs_tab_new_opportunity"`
- `linkedin_notification_context`

Notification logic:
- if a notification links directly to `/jobs/view/<id>/`, one vacancy is resolved
- if it links to a jobs list/search page, all job cards on that page are parsed with the normal LinkedIn extractor
- the notifications pass is best-effort and non-blocking relative to the standard search pass

Important:
- absence of notification fields in output does not automatically mean the feature is broken; it can also mean LinkedIn showed no resolvable job notifications in that run
- notification UI selectors may vary by locale or A/B tests

## Generated Artifacts
A successful local run updates these files:

- `data/vacancies_scrape_linkedin.json`
- `data/vacancies.json`
- `data/scored_vacancies.json`
- `data/relevant_vacancies.json`
- `reports/relevant_vacancy_comments.md`
- `reports/vacancies_report.md`
- `data/last_run.json`
- `data/runs/run_<timestamp>.json`
- `reports/session_notes/session_<timestamp>.md`
- `reports/verification/verify_<timestamp>.json`

## Troubleshooting

### `Phase 1b` LinkedIn issue in sandbox
Symptom:
- `parse_linkedin.js` fails in sandbox with browser launch or auth/profile errors

Meaning:
- this is usually an environment restriction, not necessarily a parser regression

Action:
- run LinkedIn parsing outside sandbox / in a real desktop session
- then inspect `reports/parse_linkedin_live.log` if needed

### Supabase sync failed
Symptom:
- orchestrator reports `Phase 2.5` issue

Meaning:
- local scoring/report generation may still be correct

Action:
- verify local artifacts first
- treat sync as integration troubleshooting, not immediate local data corruption

### Telegram send failed
Symptom:
- orchestrator reports `Phase 4` issue

Meaning:
- report/scoring outputs may still be valid
- Telegram currently depends on Supabase-backed sent-status lookup

Action:
- use `--skip-telegram` for local validation runs
- debug Supabase and Telegram connectivity separately

### Useful Inspection Commands

```bash
node scripts/parse_linkedin.js --today-stats
node scripts/score_vacancies.js
node scripts/resume_self_check.js
node scripts/merge_vacancies.js
```

## Session Entry Docs
Read these before continuing meaningful work:

- `WORKING-CONTRACT.md`
- `SESSION-HANDOFF.md`
- `docs/ops/location-policy.md`
- `docs/ops/project-memory.md`
