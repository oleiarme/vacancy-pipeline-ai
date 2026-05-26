# Working Contract, Session Handoff, and Doctor Design

**Context**

The repository already has useful execution artifacts:
- `TODO.md` for backlog direction
- `reports/session_notes/` for historical run notes
- `reports/verification/` for verification outputs
- `AGENTS.md` for session-start instructions

What is missing is a lightweight operating layer for day-to-day work in this repo:
- a repo-specific working contract
- a single live handoff file for the next session
- one fast verification command that is cheap enough to run by default

**Goals**

- Make session continuation explicit instead of reconstructing state from scattered files.
- Define what "done" means for this repo.
- Add one fast `doctor` command that covers the highest-value checks without pulling in expensive runtime flows.
- Keep the system small enough that it actually gets used.

**Non-goals**

- No heavy orchestration for handoff generation yet.
- No full runtime pipeline in the default doctor command.
- No duplication of the general agent instructions already stored in `AGENTS.md`.

**Recommended Approach**

Use a minimal repo-layer:
- add `WORKING-CONTRACT.md` in the repo root
- add `SESSION-HANDOFF.md` in the repo root
- add `doctor:quick` and `doctor` scripts in `package.json`
- link the contract and handoff files from `AGENTS.md`

This keeps the workflow obvious and low-friction while fitting the current repository shape.

**Structure**

`WORKING-CONTRACT.md`
- Short statement of repo purpose and operating style
- Definition of done
- Required default verification command
- Rules for small-batch changes, bugfixes, and verification claims
- Expected artifacts to leave behind after meaningful work

`SESSION-HANDOFF.md`
- Current focus
- Last completed
- Next step
- Open risks
- Verification
- Files touched
- Notes for next session

`doctor:quick`
- `node hydration_scoring_contract.test.js`
- `node tests/location_policy_fixtures.test.js`
- `node tests/scoring_rules_fixtures.test.js`
- `node tests/vacancy_utils_fixtures.test.js`
- `node scripts/verify_pipeline.js`

**Trade-offs**

Pros:
- immediate value
- low maintenance
- matches current repo conventions
- avoids expensive checks in the default path

Cons:
- handoff remains manually updated for now
- no machine-enforced completeness beyond the doctor command
- long-term session history still lives in multiple places

**Success Criteria**

- A new session can read `WORKING-CONTRACT.md` and `SESSION-HANDOFF.md` and understand where to continue.
- `npm run doctor` becomes the default quick verification path.
- The repo-specific workflow no longer depends on remembering unwritten habits.

