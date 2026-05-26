# Location And Date Policy

## Purpose
This policy defines how to manage and verify location/date filters without breaking pipeline consistency.

## Non-Negotiable Rules
1. Location/date filters are configurable and may change by need.
2. Any change in filters must be applied consistently across parse and merge layers.
3. Any change in filters must be followed by verification.
4. A task is not complete until verification is green.

## Date Policy
1. `.env` must contain a valid `GMAIL_GLASSDOOR_TIME_WINDOW` value: `today | 1d | 3d | all`.
2. If `today` is used, `scripts/parse_gmail_glassdoor.js` must enforce day filtering with message `internalDate` (not query-only filtering).

## Location Policy
1. `config/search_config.json -> filters.locations` is the active location profile.
2. Search URLs and resulting data must match the active location profile.
3. Filter logic must be enforced at parse and merge stages.
4. `verify_pipeline` is the gate for profile consistency.

## Current Default Profile
Current default location profile is Portugal-centric. This is a default, not a permanent constraint.

## Required Verification
Run after any filter/config change:

```bash
node scripts/score_vacancies.js --no-hydrate
npm.cmd run verify:pipeline
```

Expected:
1. `PASS: Gmail time window is configured`
2. `PASS: search_config has active location profile`
3. `PASS: search_config URLs match active location profile`
4. `PASS: Merged vacancies match location profile, valid links, and dedup by id`
5. `PASS: Mail Glassdoor data matches location profile`
6. `PASS: Scored vacancies are consistent`

## Change Management
1. Never change date/location filters in only one layer.
2. Update this file when changing filter semantics.
3. Keep decisions deterministic and easy to audit from logs.
