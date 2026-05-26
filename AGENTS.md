# Persistent User Context

At the start of every session in this repository:
- Read `WORKING-CONTRACT.md`.
- Read `SESSION-HANDOFF.md`.
- Read `C:\Users\oleia\.codex\memories\user-profile.md`.
- Treat that file as persistent user context for all future conversations in this repo.
- Apply that context automatically when answering, without asking the user to repeat it.
- Update the memory file when you learn stable facts with high confidence.
- Do not invent missing details. Leave unknown fields explicitly unknown until the user confirms them.

Before ending meaningful work in this repository:
- Update `SESSION-HANDOFF.md` with current actionable state.

Remember the following about me and reference it in all future conversations without me needing to repeat it:

[Your Background]
- What you do professionally
- Your current role/situation
- Your skill level in relevant areas

[Your Goals]
- What you're working toward (short and long-term)
- Why these goals matter to you
- Your timeline and constraints

[Your Preferences]
- How you like information delivered (direct vs detailed, technical vs accessible)
- What frustrates you or wastes your time
- Topics you care about or frequently explore

[Your Context]
- Current projects or challenges
- Resources you have access to
- Limitations or boundaries I should respect

Update this mental model as you learn more about me through our conversations. When I ask questions, factor in this context automatically, don't make me re-explain things you should already know.

Treat this like a persistent working relationship, not isolated interactions.

## Skill Governance

`AGENTS.md` is the source of truth for skill selection and skill-loading behavior in this repository.

### Core Rules

- Check whether any skill applies before responding or taking action.
- Use the minimal set of applicable skills that fully covers the task.
- Prefer process skills first, then implementation skills.
- Announce which skill(s) you are using and why in one short line.
- If a skill has a checklist, track and complete its required steps using the tooling available in the current environment.
- If a skill is marked rigid, follow it exactly.

### Codex Loading Rules

- In this Codex environment, skills are used by opening the relevant `SKILL.md` file directly and following it.
- Do not rely on a `Skill` tool unless the current environment explicitly provides one.
- When a skill references tooling that does not exist in the current environment, adapt only the loading or tracking mechanism; do not weaken the skill's substantive requirements.

### Precedence

- Prefer repo-local skills under `.agents\skills\superpowers\skills\...` when the same skill name also exists in a global directory.
- Treat global skills as supplemental. Use them when they are explicitly requested, when no repo-local equivalent exists, or when the task clearly matches their documented trigger.
- If repo-local instructions and injected session instructions diverge, follow this file for repo workflow and skill handling unless a higher-priority system or developer instruction requires otherwise.

### Repo-Local Skills

These are the primary skills for this repository:

- `using-superpowers`
- `brainstorming`
- `dispatching-parallel-agents`
- `executing-plans`
- `finishing-a-development-branch`
- `receiving-code-review`
- `requesting-code-review`
- `subagent-driven-development`
- `systematic-debugging`
- `test-driven-development`
- `using-git-worktrees`
- `verification-before-completion`
- `writing-plans`
- `writing-skills`

### GStack Skills (Opinionated Automation)

These skills are provided by [gstack](file:///c:/Users/oleia/Documents/2026/antigravity/cv/.agents/skills/gstack) and focus on product strategy, engineering rigor, and QA automation:

- `office-hours` — Product strategy and reframing
- `plan-ceo-review` — CEO-level scope and strategy review
- `plan-eng-review` — Architecture and test plan verification
- `plan-design-review` — UX/UI and "AI slop" audit
- `design-consultation` — Design system and mockup generation
- `review` — Deep code review and auto-fixing
- `investigate` — Systematic root-cause debugging
- `qa` — Browser-based testing and bug fixing
- `ship` — Test auditing and PR creation
- `land-and-deploy` — Merge and production verification
- `canary` — Post-deploy health monitoring
- `benchmark` — Performance and CWV testing
- `document-release` — Automatic documentation updates
- `retro` — Team and project retrospectives
- `browse` — Headless browser automation
- `setup-browser-cookies` — Cookie import from real browsers
- `autoplan` — Fully automated multi-role review pipeline
- `careful`, `freeze`, `guard`, `unfreeze` — Safety and scope guardrails
- `metaclaw` — Self-evolving learning, multi-agent debate, and 4-layer verification (from AutoResearchClaw)

### Supplemental Skills

Supplemental global skills may also be available, including:

- `agent-memory-skill`
- `find-skills`
- `skill-creator`
- `skill-installer`
- `slides`
- `spreadsheets`

Use them only under the precedence rules above.

### Skill Trigger Notes

- Use `using-superpowers` at the start of each conversation to determine which other skills apply.
- Use `brainstorming` before creative work, new features, new behavior, or solution design.
- Use `systematic-debugging` before attempting fixes for bugs, failing tests, or unexpected behavior.
- Use `test-driven-development` before implementing a feature or bugfix.
- Use `verification-before-completion` before claiming work is complete or fixed.
- Use `writing-skills` when creating or editing skills or when validating that skill instructions work.

### Missing or Conflicting Skills

- If a requested skill path cannot be read, say so briefly and continue with the best available fallback.
- If two skills impose conflicting process requirements, call out the conflict explicitly and follow the stricter path unless a higher-priority instruction says otherwise.
