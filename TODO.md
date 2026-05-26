# Refactor Backlog

## Current Sprint

- [x] Add repo workflow operating layer (`WORKING-CONTRACT.md`, `SESSION-HANDOFF.md`, `doctor`)
- [x] Extract shared scoring rules into `scripts/lib/scoring_rules.js`
- [x] Move description hydration out of `score_vacancies.js`
- [x] Add fixture-based tests for scoring and policy checks
- [x] Redesign vacancy scoring around transferable skills and safe-ownership ramps
- [x] Add LinkedIn notifications-based job discovery metadata and fixture coverage
- [x] Add decision-based search relevance and explicit `do_not_apply_now` search output
- [x] Split verifier into static and runtime layers
- [x] Add closed/expired vacancy detection and Telegram filtering

## Prioritized Backlog

### 1. Shared Scoring Core
Estimate: 2-3 hours

- Create `scripts/lib/scoring_rules.js`
- Move duplicated rules from `score_vacancies.js` and `resume_self_check.js`
- Keep behavior stable while removing drift risk

### 2. Separate Hydration From Scoring
Estimate: 3-4 hours

- Create `scripts/hydrate_descriptions.js`
- Keep `score_vacancies.js` focused on pure scoring
- Move hydration error reporting to a dedicated notifier

### 3. Fixture-Based Tests
Estimate: 4-6 hours

- Add `tests/fixtures/` for vacancies, scoring inputs, and config
- Cover scoring bonuses/penalties, mandatory skill detection, and location policy
- Add a single local test command to `package.json`

### 4. Add Decision-Based Search Output
Estimate: 3-5 hours

- Add binary `decision` to scored vacancies: `apply` vs `do_not_apply_now`
- Make `relevant` derive from `decision`, not just `score >= 60`
- Cap no-apply scores so hard-gap roles cannot surface as high-fit
- Show `Decision: do not apply now` in search/local output only
- Keep Telegram formatting free of decision labels

### 5. Split Verification Layers
Estimate: 3-4 hours

- Keep a static verifier for config and repository contracts
- Keep a runtime verifier for generated artifacts
- Make CI depend only on deterministic checks or fixtures

### 6. Modularize Orchestrator
Estimate: 6-8 hours

- Extract phase handlers from `scripts/orchestrate.js`
- Standardize phase results as `{ ok, warnings, artifacts, metrics }`
- Reduce `process.exit()` branches in phase logic

### 7. Centralize Config Loading
Estimate: 3-4 hours

- Add `scripts/lib/config.js`
- Validate `.env` and `config/search_config.json` in one place
- Expose typed defaults and normalized values

### 8. Move Secrets And Profiles Out Of Repo Tree
Estimate: 4-6 hours

- Relocate auth profiles and secret files outside the repository
- Replace hardcoded repo-local paths with config-driven paths
- Leave examples and docs in-repo, keep runtime state outside

## Recommended Commit Order

1. `refactor: extract shared scoring rules module`
2. `refactor: split description hydration from vacancy scoring`
3. `test: add fixture-based tests for scoring and verification`
4. `feat: add decision-based search relevance and no-apply output`
5. `refactor: split static and runtime verification`
6. `refactor: modularize pipeline phase handlers`
7. `refactor: centralize config loading and validation`
8. `chore: move runtime secrets and auth profiles out of repo tree`

## Notes

- Do not mix security relocation with scoring refactors in the same commit.
- Preserve current pipeline behavior until fixtures and verification are in place.
- Prefer small commits that keep `orchestrate.js` runnable after each step.

