# Transferable Skill Vacancy Scoring Design

**Context**

The current vacancy scorer over-weights exact keyword matches and under-models transferable skills.
That creates false negatives for roles where the user already has the right engineering foundation but is missing a named tool that can be learned quickly or safely ramped within the same delivery domain.

The target behavior is not "optimistic scoring at any cost."
The target behavior is a more realistic estimate of time-to-safe-ownership.

**Goals**

- Treat nearby tools and platforms as transferable when the user already has the underlying engineering base.
- Distinguish between "quickly familiarized" tools and tools that require a meaningful delivery ramp.
- Keep hard penalties for real domain shifts or long-ramp responsibility gaps.
- Make the reasoning output explain why a gap is soft, adjacent, or hard.

**Non-goals**

- No fully personalized interview probability model yet.
- No interactive questionnaire for every vacancy.
- No attempt to infer hidden experience that is absent from both the resume and repo rules.

**Decision Model**

The scorer should evaluate requirements by time-to-safe-ownership, not by exact keyword overlap alone.

Requirement classes:

- `direct match`
  - The resume already shows the skill or equivalent production usage.
  - Full weight.

- `familiarizable tool`
  - Can usually be learned in `1-7 days`.
  - Does not change the class of engineering responsibility.
  - No penalty and may receive small positive credit.
  - Example: Airtable when the role mainly needs reading existing structures, API integration, or migration support.

- `adjacent delivery skill`
  - Same engineering domain, but safe ownership requires delivery nuance such as testing, observability, cost, rollback, reliability, or platform semantics.
  - Partial positive credit, no hard penalty.
  - Examples: BigQuery, DBT, Airflow/Astro for a candidate with Python, SQL, GCP, CI/CD, and automation foundations.

- `hard gap`
  - Different class of work, different operating logic, or ramp clearly longer than about three weeks to safe ownership.
  - Penalty remains appropriate.

**Examples**

- `Airtable`
  - Usually `familiarizable tool`.
  - No penalty when the role only needs learning existing structures, extracting data, or integrating its API.
  - Only becomes a stronger gap if the role is fundamentally an Airtable admin/builder ownership role.

- `BigQuery`
  - Not just "SQL on GCP".
  - Adjacent when the resume already shows SQL, GCP, and data/pipeline thinking.
  - Partial credit only, because safe ownership still includes cost, permissions, modeling, partitioning, and performance nuance.

- `DBT`
  - Adjacent when the resume shows SQL plus pipeline or CI/CD discipline.
  - Partial credit only, because ownership includes lineage, testing, transformation modeling, and deployment semantics.

- `Airflow/Astro`
  - Adjacent when the resume shows Python automation, orchestration mindset, CI/CD, and production operations.
  - Partial credit only, because ownership includes retries, idempotency, scheduling semantics, and operational failure handling.

**Scoring Changes**

Use a two-layer view:

- `core fit`
  - Direct overlap with the main role requirements.

- `transferable fit`
  - Positive partial credit for adjacent tools and fast-ramp tooling.

This means nearby tools should not only avoid penalties; they should contribute bounded positive signal.

**Reasoning Output**

The output should stop collapsing all missing skills into one bucket.
Reasons should distinguish:

- `direct match`
- `adjacent, short ramp`
- `adjacent, ownership ramp`
- `familiarizable tool`
- `hard gap`

**Expected Outcome**

Roles like data-platform modernization should rank higher when the user already has Python, GCP, CI/CD, infrastructure-as-code, API integration, and operational discipline.
The system should still avoid over-rating roles that require a truly different work pattern or deep specialized ownership outside the user's current base.

**Constraints**

- Keep the implementation small and deterministic.
- Reuse the shared scoring rules module so scorer and resume self-check stay aligned.
- Add fixture coverage for both classification and score behavior.
- The repo is not currently a git repository, so the workflow cannot rely on worktrees or commits in this environment.
