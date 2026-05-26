# Decision-Based Search Output Design

**Context**

The current scorer collapses two separate questions into one number:

- "How much overlap exists between the resume and the vacancy?"
- "Should the candidate apply now?"

That allows false-positive search output such as a high fit percentage for a vacancy that still has mandatory hard capability gaps.

For this repository, the required behavior is:

- search/local review output must show a clear application decision
- `do_not_apply_now` must surface directly in search output
- Telegram output must not show the new decision label

**Goals**

- Introduce a first-class binary `decision` field in scored vacancy data.
- Make `decision` the source of truth for search relevance.
- Prevent vacancies with mandatory hard gaps from appearing as high-fit apply targets.
- Keep Telegram formatting unchanged apart from consuming the corrected selection set.

**Non-goals**

- No multi-state review workflow.
- No preference-only rejection model in this change.
- No Telegram wording change to include `Decision: ...`.

**Decision Model**

Add a binary field:

- `decision = "apply"`
- `decision = "do_not_apply_now"`

Evaluation order:

1. Detect vacancy skills and mandatory requirements.
2. Classify each required skill using existing scoring rules.
3. Compute `decision`.
4. Apply score caps after decision is known.
5. Derive `relevant` from `decision`, not directly from numeric score.

Decision rules:

- `do_not_apply_now`
  - at least one mandatory requirement is classified as a blocking hard gap
  - or an explicit core stack mismatch is detected
- `apply`
  - no blocking mandatory hard gaps
  - no explicit core stack mismatch

**Scoring Behavior**

`score` remains useful for ranking, but only inside the set of vacancies worth applying to.

New cap rule:

- if `decision = "do_not_apply_now"`, cap `score` at `39`

This ensures a vacancy cannot simultaneously present as a top fit and a no-apply case.

**Relevance Behavior**

Current behavior uses `score >= 60` as the main relevance gate.
That should change to:

- `relevant = (decision === "apply")`

Any score threshold that remains should be treated as ranking/reporting metadata, not as the primary application decision.

**Search Output**

Search-facing or local review output should print the decision explicitly.

Expected shape:

```text
Nearshore Sector | Databricks Data Engineer | Devoteam
Decision: do not apply now
Reason: hard capability mismatch on mandatory/core stack (Databricks, Spark, data warehousing)
```

The decision label should be visible in search/local analysis output, not hidden inside a long reasoning string.

**Telegram Output**

Telegram should not print the new `Decision: ...` label.

Default Telegram delivery must send only vacancies where `decision = "apply"`.

The Telegram sender should use the corrected `relevant` set for normal delivery, and its visible text should remain aligned with the current concise summary format.

**Pipeline Impact**

This change touches more than the scorer because `relevant` is reused downstream.

Affected areas:

- `scripts/score_vacancies.js`
  - compute `decision`
  - cap score for no-apply vacancies
  - derive `relevant` from `decision`
- `scripts/resume_self_check.js`
  - rely on `decision`/`relevant` rather than `score >= 60`
- `scripts/orchestrate.js`
  - update relevant counts, validation, and report wording
- `scripts/send_telegram.js`
  - keep display format unchanged while selecting from updated relevant logic
- `scripts/supabase_sync.js`
  - sync `relevant` consistently from scored data
- `package.json`
  - update helper scripts that still report `score >= 60` as relevance

**Testing**

Minimum required coverage:

- mandatory hard gap yields:
  - `decision = "do_not_apply_now"`
  - `relevant = false`
  - score capped below the apply threshold
- apply-safe vacancy yields:
  - `decision = "apply"`
  - `relevant = true`
- Telegram formatting path does not print `Decision: ...`

**Constraints**

- Keep the implementation deterministic and local to the existing pipeline.
- Reuse current scoring-rule classification instead of inventing a second skill model.
- This workspace is not a git repository, so plan and handoff docs can be updated, but git commit steps cannot be executed here.


