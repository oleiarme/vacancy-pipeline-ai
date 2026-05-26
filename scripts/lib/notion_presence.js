const path = require('path');
const { pathToFileURL } = require('url');
const { loadEnvFile } = require('./env');
const { normalizeText } = require('./text_utils');

const DEFAULT_NOTION_ROOT = path.resolve(__dirname, '..', '..', '..', 'notion');

function normalizeJobUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        return `${parsed.host}${parsed.pathname}${parsed.search}`.replace(/\/$/, '').toLowerCase();
    } catch {
        return normalizeText(raw);
    }
}

function getPlainTextArray(items) {
    return Array.isArray(items)
        ? items.map((item) => String(item && (item.plain_text || (item.text && item.text.content) || '')).trim()).filter(Boolean)
        : [];
}

function getPageCompany(page) {
    return getPlainTextArray(page && page.properties && page.properties.Company && page.properties.Company.title).join(' ');
}

function getPagePosition(page) {
    return getPlainTextArray(page && page.properties && page.properties.Position && page.properties.Position.rich_text).join(' ');
}

function getPageJobUrl(page) {
    return String(page && page.properties && page.properties['Job URL'] && page.properties['Job URL'].url || '').trim();
}

function getPageStatus(page) {
    return String(page && page.properties && page.properties.Status && page.properties.Status.select && page.properties.Status.select.name || '').trim() || 'Unknown';
}

function buildTitleCompanyKey(title, company) {
    return `${normalizeText(title)}::${normalizeText(company)}`;
}

function buildPageSummary(page) {
    return {
        found: true,
        matchType: 'title_company',
        pageUrl: String(page && page.url || '').trim(),
        status: getPageStatus(page),
        company: getPageCompany(page),
        position: getPagePosition(page),
        jobUrl: getPageJobUrl(page),
    };
}

function buildNotionPresenceIndex(pages) {
    const byUrl = new Map();
    const byTitleCompany = new Map();
    const rows = Array.isArray(pages) ? pages : [];

    for (const page of rows) {
        const summary = buildPageSummary(page);
        const urlKey = normalizeJobUrl(summary.jobUrl);
        const tcKey = buildTitleCompanyKey(summary.position, summary.company);

        if (urlKey && !byUrl.has(urlKey)) {
            byUrl.set(urlKey, { ...summary, matchType: 'url' });
        }
        if (tcKey !== '::' && !byTitleCompany.has(tcKey)) {
            byTitleCompany.set(tcKey, { ...summary, matchType: 'title_company' });
        }
    }

    return { byUrl, byTitleCompany };
}

function findNotionMatch(vacancy, index) {
    const safeIndex = index || { byUrl: new Map(), byTitleCompany: new Map() };
    const urlKey = normalizeJobUrl(vacancy && vacancy.link);
    if (urlKey && safeIndex.byUrl.has(urlKey)) {
        return { ...safeIndex.byUrl.get(urlKey), found: true, matchType: 'url' };
    }

    const tcKey = buildTitleCompanyKey(vacancy && vacancy.title, vacancy && vacancy.company);
    if (safeIndex.byTitleCompany.has(tcKey)) {
        return { ...safeIndex.byTitleCompany.get(tcKey), found: true, matchType: 'title_company' };
    }

    return {
        found: false,
        matchType: null,
        pageUrl: '',
        status: '',
    };
}

async function importNotionTooling(notionRoot = DEFAULT_NOTION_ROOT) {
    const envPath = path.join(notionRoot, '.env');
    const env = loadEnvFile(envPath);
    const notionModuleUrl = pathToFileURL(path.join(notionRoot, 'tools', 'notionClient.js')).href;
    const notionClient = await import(notionModuleUrl);
    const dbId = String(env.NOTION_DATABASE_ID || '').trim();
    const token = String(env.NOTION_API_TOKEN || '').trim();

    if (!dbId || !token) {
        throw new Error(`Notion env is missing NOTION_DATABASE_ID or NOTION_API_TOKEN at ${envPath}`);
    }

    return {
        client: notionClient.createClient(token),
        dbId,
    };
}

async function fetchAllNotionPages(client, dbId) {
    const pages = [];
    let cursor = undefined;

    do {
        const response = await client.databases.query({
            database_id: dbId,
            start_cursor: cursor,
            page_size: 100,
        });
        pages.push(...(response.results || []));
        cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    return pages;
}

async function loadNotionPresenceIndex(options = {}) {
    const notionRoot = options.notionRoot || DEFAULT_NOTION_ROOT;
    const { client, dbId } = await importNotionTooling(notionRoot);
    const pages = await fetchAllNotionPages(client, dbId);
    return buildNotionPresenceIndex(pages);
}

async function annotateVacanciesWithNotionPresence(vacancies, options = {}) {
    const rows = Array.isArray(vacancies) ? vacancies : [];
    if (rows.length === 0) return [];

    const index = options.index || await loadNotionPresenceIndex(options);
    return rows.map((vacancy) => {
        const match = findNotionMatch(vacancy, index);
        return {
            ...vacancy,
            notion_found: match.found,
            notion_match_type: match.matchType,
            notion_status: match.status,
            notion_page_url: match.pageUrl,
        };
    });
}

module.exports = {
    annotateVacanciesWithNotionPresence,
    buildNotionPresenceIndex,
    buildTitleCompanyKey,
    findNotionMatch,
    getPageCompany,
    getPageJobUrl,
    getPagePosition,
    getPageStatus,
    loadNotionPresenceIndex,
    normalizeJobUrl,
    normalizeText,
};
