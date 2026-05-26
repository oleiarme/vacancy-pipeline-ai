# Telegram Ignore Control Design

## Goal
Allow vacancies to be marked from Telegram as "do not show again" via inline buttons and a `/ignore` command.

## Constraints
- The vacancy report sender lives in `cv` and is a one-shot script.
- The long-running Telegram bot listener lives in the sibling `notion` workspace and uses the same bot token.
- `--all-relevant` must still hide ignored vacancies.
- Avoid changing Supabase schema for this feature.

## Design
- Add a local ignore registry in `cv/data/ignored_vacancies.json`.
- Registry key is vacancy `id`; keep metadata (`link`, `title`, `company`, `ignored_at`, `source`).
- `send_telegram.js` filters ignored vacancies before any urgent/relevant/Notion split.
- Each Telegram report chunk gets inline buttons labeled `Ignore #N` for the vacancies in that chunk.
- Callback data format: `ignore:<vacancyId>`.
- The Telegram bot in the sibling `notion` workspace handles:
  - inline callback `ignore:<id>`
  - command `/ignore <id|link>`
- The bot updates the ignore registry in the `cv` workspace and acknowledges the action in chat.

## Tradeoffs
- Inline buttons are chunk-scoped, so labels use report numbers rather than appearing directly under each line.
- Local JSON registry is simple and works for all report modes, but not multi-user safe. This is acceptable for the current single-user workflow.
