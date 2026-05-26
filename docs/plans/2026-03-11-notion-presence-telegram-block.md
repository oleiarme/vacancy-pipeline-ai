# Notion Presence Telegram Block Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Check each apply-ready vacancy against the neighboring Notion job database and send already-known vacancies in a separate Telegram block with their current Notion status.

**Architecture:** Add a dedicated `notion_presence` helper in `cv` that reuses the existing Notion client from the sibling `notion` workspace, first matching by URL and then falling back to normalized `title + company`. Update Telegram send flow to split selected vacancies into `alreadyInNotion` and `fresh`, then send a separate block for the Notion matches.

**Tech Stack:** Node.js, CommonJS + dynamic ESM import, Notion API, Telegram HTML formatting

---

### Task 1: Write failing tests

**Files:**
- Create: `tests/notion_presence.test.js`
- Modify: `tests/telegram_formatting.test.js`

**Step 1:** Add tests for URL match, fallback `title + company` match, and status extraction.

**Step 2:** Add a Telegram formatting test for the separate Notion-marked block helper.

**Step 3:** Run the focused tests and verify they fail before implementation.

### Task 2: Add Notion presence helper

**Files:**
- Create: `scripts/lib/notion_presence.js`

**Step 1:** Load `.env` from the sibling `notion` workspace.

**Step 2:** Dynamically import the sibling `tools/notionClient.js` and create a client.

**Step 3:** Implement lookup order: URL first, then normalized `title + company`.

**Step 4:** Return `found`, `matchType`, `status`, and `pageUrl`.

### Task 3: Integrate Telegram send flow

**Files:**
- Modify: `scripts/lib/telegram_formatting.js`
- Modify: `scripts/send_telegram.js`

**Step 1:** Add a small formatter for Notion-present vacancies.

**Step 2:** Enrich selected vacancies with Notion presence before chunking.

**Step 3:** Send a separate `Already in Notion` block with status, and exclude those rows from normal urgent/relevant blocks.

### Task 4: Verify and document

**Files:**
- Modify: `SESSION-HANDOFF.md`

**Step 1:** Run focused tests.

**Step 2:** Run `cmd /c npm run doctor`.

**Step 3:** If needed, dry-run or live-run Telegram send path and record the result in handoff.
