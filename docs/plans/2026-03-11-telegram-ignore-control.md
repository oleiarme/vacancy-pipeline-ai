# Telegram Ignore Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the user hide vacancies directly from Telegram using inline `Ignore` buttons and `/ignore <id|link>`, with the choice persisting across future vacancy reports.

**Architecture:** Store ignored vacancies in a local JSON registry under `cv/data`, filter them in the report sender before all report sections, and wire the existing sibling Telegram bot to mutate that registry via callbacks and commands.

**Tech Stack:** Node.js, Telegram Bot API, Telegraf, local JSON registry

---

### Task 1: Add failing tests in `cv`
- Create `tests/ignore_registry.test.js`
- Extend `tests/telegram_formatting.test.js` or add helper tests for ignore button callback payloads
- Run the focused tests and verify failure

### Task 2: Implement ignore registry in `cv`
- Create `scripts/lib/ignore_registry.js`
- Support load, save, add-by-vacancy, add-by-id, add-by-link, and filter helpers
- Keep the file resilient when missing

### Task 3: Integrate ignore filtering and inline buttons in `cv`
- Modify `scripts/send_telegram.js`
- Filter ignored vacancies before Notion split and urgent/relevant chunking
- Add inline buttons `Ignore #N` for each vacancy in the chunk
- Reuse a helper for callback payload formatting if needed

### Task 4: Patch the sibling `notion` Telegram bot
- Modify `C:\Users\oleia\Documents\2026\antigravity\notion\index.js`
- Add `/ignore <id|link>` command
- Add `bot.action(/^ignore:/, ...)` handler
- Write to `cv/data/ignored_vacancies.json`

### Task 5: Verify end-to-end
- Run `node tests/ignore_registry.test.js`
- Run `node tests/telegram_formatting.test.js`
- Run `npm run doctor`
- Run one live send after enabling network and confirm the callback/command path manually
