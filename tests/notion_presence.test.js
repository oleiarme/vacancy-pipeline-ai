const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildNotionPresenceIndex,
    findNotionMatch,
    getPageStatus,
} = require('../scripts/lib/notion_presence');

const pageByUrl = {
    url: 'https://www.notion.so/page-url',
    properties: {
        'Company': { title: [{ plain_text: 'Hostelworld Group' }] },
        'Position': { rich_text: [{ plain_text: 'Senior Site Reliability FinOps Engineer' }] },
        'Job URL': { url: 'https://www.linkedin.com/jobs/view/4376741761/' },
        'Status': { select: { name: 'Interview' } },
    },
};

const pageByTitleCompany = {
    url: 'https://www.notion.so/page-title-company',
    properties: {
        'Company': { title: [{ plain_text: 'Hostelworld Group' }] },
        'Position': { rich_text: [{ plain_text: 'Senior Site Reliability FinOps Engineer' }] },
        'Job URL': { url: 'https://www.linkedin.com/jobs/view/DIFFERENT/' },
        'Status': { select: { name: 'Applied' } },
    },
};

test('notion presence index lookup', (t) => {
    t.test('should read Status select name from Notion page', () => {
        assert.equal(getPageStatus(pageByUrl), 'Interview');
    });

    const index = buildNotionPresenceIndex([pageByUrl, pageByTitleCompany]);

    t.test('exact URL match should win first', () => {
        const urlMatch = findNotionMatch({
            title: 'Senior Site Reliability FinOps Engineer',
            company: 'Hostelworld Group',
            link: 'https://www.linkedin.com/jobs/view/4376741761/',
        }, index);
        assert.equal(urlMatch.found, true);
        assert.equal(urlMatch.matchType, 'url');
        assert.equal(urlMatch.status, 'Interview');
    });

    t.test('title+company fallback should be found even with different links', () => {
        const fallbackMatch = findNotionMatch({
            title: 'Senior Site Reliability FinOps Engineer',
            company: 'Hostelworld Group',
            link: 'https://www.linkedin.com/jobs/view/another-id/',
        }, index);
        assert.equal(fallbackMatch.found, true);
        assert.equal(fallbackMatch.matchType, 'title_company');
        assert.equal(fallbackMatch.status, 'Interview');
    });
});
