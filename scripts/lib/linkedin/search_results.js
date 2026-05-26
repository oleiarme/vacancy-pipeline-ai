/**
 * search_results.js
 */
const { sleep, dismissBlockingUi, evaluateWithNavigationRetry } = require('./utils');

async function readPaginationTotalPages(page) {
    return evaluateWithNavigationRetry(page, () => {
        const selectors = [
            '.artdeco-pagination__pages button',
            '.artdeco-pagination__pages a',
            '.jobs-search-pagination button',
            '.jobs-search-pagination a',
            '[aria-label*="Page"]',
            '[aria-label*="Страница"]',
            '[aria-label*="Página"]',
        ];
        const values = [];
        const nodes = document.querySelectorAll(selectors.join(', '));
        nodes.forEach((node) => {
            const text = (node.textContent || '').trim();
            const label = (node.getAttribute('aria-label') || '').trim();
            const all = `${text} ${label}`.replace(/\u00A0/g, ' ');
            const matches = all.match(/\d+/g) || [];
            matches.forEach((m) => values.push(Number.parseInt(m, 10)));
        });
        const valid = values.filter((v) => Number.isFinite(v) && v > 0);
        if (!valid.length) return null;
        return Math.max(...valid);
    });
}

function parseCountFromText(rawText) {
    if (!rawText) return null;
    const match = String(rawText).match(/(\d[\d\s.,\u00A0]*)/);
    if (!match) return null;
    const digits = match[1].replace(/[^\d]/g, '');
    if (!digits) return null;
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function readDeclaredVacancyCount(page) {
    return evaluateWithNavigationRetry(page, () => {
        const selectors = [
            '.jobs-search-results-list__subtitle span',
            '.jobs-search-results-list__subtitle',
            '.jobs-search-results-list__text',
            '.jobs-search-results-list__title-heading',
            '.jobs-search-two-pane__header h1',
            'h1',
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            const text = (el && el.textContent ? el.textContent : '').trim();
            if (text && /\d/.test(text)) {
                return { text };
            }
        }
        return { text: '' };
    });
}

async function extractJobsWithRetry(page, selectors, attempts = 3) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await dismissBlockingUi(page);
        const jobs = await evaluateWithNavigationRetry(page, (cfg) => {
            const results = [];
            const seenIds = new Set();
            const cardSelectors = [
                cfg.vacancyCard,
                'li[data-occludable-job-id]',
                '.scaffold-layout__list-item[data-occludable-job-id]',
                '.job-card-container',
            ].filter(Boolean);

            const cards = document.querySelectorAll(cardSelectors.join(', '));
            const extractPosted = (card) => {
                const postedSelectors = [
                    'time[datetime]',
                    'time',
                    '.job-search-card__listdate',
                    '.job-search-card__listdate--new',
                    '[class*="listdate"]',
                    '[class*="posted"]',
                ];

                for (const selector of postedSelectors) {
                    const node = card.querySelector(selector);
                    if (!node) continue;
                    const text = ((node.innerText || node.textContent || '') + '').replace(/\s+/g, ' ').trim();
                    if (text) return text;
                    const datetime = (node.getAttribute && node.getAttribute('datetime') || '').trim();
                    if (datetime) return datetime;
                }

                const cardText = (card.innerText || '').replace(/\s+/g, ' ').trim();
                const match = cardText.match(
                    /(just posted|just now|today|yesterday|сегодня|вчера|<\s*1\s*d|\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s*ago|\d+(?:\.\d+)?\s*(?:минут\S*|час\S*|дн\S*|день|дня|недел\S*|месяц\S*)\s*назад|reposted\s+\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s*ago|размещена\s+повторно:?\s*\d+(?:\.\d+)?\s*(?:минут\S*|час\S*|дн\S*|день|дня|недел\S*|месяц\S*)\s*назад)/i
                );
                if (!match) return '';
                let res = String(match[1] || '').trim();
                res = res.replace(/^(?:reposted|размещена\s+повторно:?)\s+/i, '');
                return res;
            };
            
            cards.forEach((el) => {
                const linkEl =
                    el.querySelector(cfg.link) ||
                    el.querySelector('a[href*="/jobs/view/"]') ||
                    el.querySelector('a.job-card-list__title--link');
                const titleEl =
                    el.querySelector(cfg.title) ||
                    el.querySelector('.job-card-list__title--link') ||
                    linkEl;
                const companyEl =
                    el.querySelector(cfg.company) ||
                    el.querySelector('.job-card-container__primary-description') ||
                    el.querySelector('.artdeco-entity-lockup__subtitle');
                const locationEl =
                    el.querySelector(cfg.location) ||
                    el.querySelector('.job-card-container__metadata-item') ||
                    el.querySelector('.artdeco-entity-lockup__caption');
                const easyApplyEl =
                    el.querySelector('.job-card-container__apply-method') ||
                    el.querySelector('.job-card-container__footer-item');
                const postedText = extractPosted(el);

                const href = linkEl ? (linkEl.href || '').trim() : '';
                let id = '';
                const occludableId = (el.getAttribute('data-occludable-job-id') || '').trim();
                if (occludableId && /^\d+$/.test(occludableId)) {
                    id = `li_${occludableId}`;
                }
                if (href) {
                    try {
                        const urlObj = new URL(href);
                        const match = urlObj.pathname.match(/\/view\/(?:.*-)?(\d+)\/?/);
                        if (!id && match) {
                            id = `li_${match[1]}`;
                        } else if (!id) {
                            const currentJobId = urlObj.searchParams.get('currentJobId');
                            if (currentJobId) id = `li_${currentJobId}`;
                        }
                    } catch (_) {
                        // Ignore malformed url.
                    }
                }

                if (id) {
                    const rawTitle = titleEl ? titleEl.innerText.trim() : '';
                    // LinkedIn cards may contain "Title\nTitle with verification" — take first line
                    const titleText = rawTitle.split('\n')[0].replace(/\s+/g, ' ').trim();
                    const companyText = companyEl ? companyEl.innerText.trim() : '';
                    let canonicalLink = href ? href.split('?')[0] : '';
                    if (!/\/jobs\/view\/\d+/i.test(canonicalLink) && id && id.startsWith('li_')) {
                        canonicalLink = `https://www.linkedin.com/jobs/view/${id.replace('li_', '')}/`;
                    }
                    if (!titleText || !companyText || !canonicalLink || !/\/jobs\/view\/\d+/i.test(canonicalLink)) {
                        return;
                    }
                    if (seenIds.has(id)) return;
                    seenIds.add(id);
                    results.push({
                        id,
                        title: titleText,
                        company: companyText,
                        rating: null,
                        location: locationEl ? locationEl.innerText.trim() : null,
                        easyApply: easyApplyEl ? easyApplyEl.innerText.toLowerCase().includes('easy apply') : false,
                        posted: postedText,
                        link: canonicalLink,
                        source: 'linkedin',
                    });
                }
            });
            return results;
        }, selectors);

        if (jobs.length > 0) return jobs;
        if (attempt < attempts) {
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => { });
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            await evaluateWithNavigationRetry(page, () => {
                const list = document.querySelector('.jobs-search-results-list');
                if (list) {
                    list.scrollTo(0, list.scrollHeight);
                } else {
                    window.scrollTo(0, document.body.scrollHeight);
                }
            });
            await sleep(1200 * attempt);
        }
    }
    return [];
}

module.exports = {
    readPaginationTotalPages,
    parseCountFromText,
    readDeclaredVacancyCount,
    extractJobsWithRetry
};
