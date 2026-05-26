const test = require('node:test');
const assert = require('node:assert/strict');
const {
    escapeHtml,
    formatNotionVacancyLine,
    formatVacancyLine,
    selectTelegramVacancies,
} = require('../scripts/lib/telegram_formatting');
const { buildIgnoreCallbackData, buildNotionCreateCallbackData, buildVacancyKeyboard } = require('../scripts/lib/telegram_actions');

const applyVacancy = {
    id: 'apply_1',
    title: 'Senior Data Engineer',
    company: 'Example',
    link: 'https://example.com/jobs/1',
    score: 78,
    decision: 'apply',
    relevant: true,
    resume_self_check_passed: true,
    posted: '1d',
    posted_days: 1,
    location: 'Lisbon, Portugal',
    reasons: ['+55 Weighted resume/role skill fit', '+15 Role title match'],
};

const rejectVacancy = {
    id: 'reject_1',
    title: 'Databricks Data Engineer',
    company: 'RejectCo',
    link: 'https://example.com/jobs/2',
    score: 39,
    decision: 'do_not_apply_now',
    relevant: false,
    resume_self_check_passed: true,
    posted: '1d',
    posted_days: 1,
    location: 'Lisbon, Portugal',
    reasons: ['-24 Hard gaps in mandatory skills (bigquery, dbt)'],
};

test('telegram formatting and selection', (t) => {
    t.test('default Telegram selection should include only apply decision vacancies', () => {
        const selected = selectTelegramVacancies([applyVacancy, rejectVacancy], { underMode: false });
        assert.deepEqual(selected.map((v) => v.id), ['apply_1']);
    });

    t.test('Telegram vacancy line must not show decision label', () => {
        const line = formatVacancyLine(rejectVacancy, false);
        assert.equal(/Decision:/i.test(line), false);
    });

    t.test('urgent header must be HTML-safe for Telegram parse mode', () => {
        assert.equal(escapeHtml('Urgent (<=5d):'), 'Urgent (&lt;=5d):');
    });

    t.test('Notion vacancy line should include status and mark presence', () => {
        const notionLine = formatNotionVacancyLine({
            ...applyVacancy,
            notion_status: 'Applied',
            notion_page_url: 'https://www.notion.so/page',
            notion_match_type: 'title_company',
        });
        assert.equal(/Status: Applied/.test(notionLine), true);
        assert.equal(/Notion/i.test(notionLine), true);
    });
});

test('telegram actions callbacks and keyboards', (t) => {
    t.test('should correctly build ignore and notion callback payloads', () => {
        assert.equal(buildIgnoreCallbackData('li_123'), 'ignore:li_123');
        assert.equal(buildNotionCreateCallbackData('li_123'), 'notion_create:li_123');
    });

    t.test('fresh vacancy keyboard details', () => {
        const freshKeyboard = buildVacancyKeyboard({ ...applyVacancy, notion_found: false }, 9);
        assert.equal(freshKeyboard.inline_keyboard[0][0].text, 'Ignore #9');
        assert.equal(freshKeyboard.inline_keyboard[0][0].callback_data, 'ignore:apply_1');
        assert.equal(freshKeyboard.inline_keyboard[0][1].text, 'Create in Notion');
        assert.equal(freshKeyboard.inline_keyboard[0][1].callback_data, 'notion_create:apply_1');
    });

    t.test('existing notion vacancy keyboard details', () => {
        const notionKeyboard = buildVacancyKeyboard({
            ...applyVacancy,
            notion_found: true,
            notion_page_url: 'https://www.notion.so/page',
        }, 9);
        assert.equal(notionKeyboard.inline_keyboard[0][1].text, 'Open in Notion');
        assert.equal(notionKeyboard.inline_keyboard[0][1].url, 'https://www.notion.so/page');
    });
});
