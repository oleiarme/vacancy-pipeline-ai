/**
 * parse_linkedin.js - automatic LinkedIn scraping via Playwright.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./lib/env');
const { normalizePosted, getPostedDays, isPortugalVacancy } = require('./lib/vacancy_utils');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const LINKEDIN_VACANCIES_PATH = path.resolve(ROOT, 'data', 'vacancies_scrape_linkedin.json');
const runtimeEnv = loadEnvFile(ENV_PATH);
const args = process.argv.slice(2);
const LINKEDIN_ONLY_TODAY = String(runtimeEnv.LINKEDIN_ONLY_TODAY || 'true').trim().toLowerCase() !== 'false';
const TODAY_STATS_MODE = args.includes('--today-stats');
const LOG_POSTED_NORMALIZATION = args.includes('--log-posted')
    || String(runtimeEnv.LINKEDIN_LOG_POSTED_NORMALIZATION || 'false').trim().toLowerCase() === 'true';
const MAX_POSTED_LOGS_RAW = Number.parseInt(String(runtimeEnv.LINKEDIN_MAX_POSTED_LOGS || '40'), 10);
const MAX_POSTED_LOGS = Number.isFinite(MAX_POSTED_LOGS_RAW) && MAX_POSTED_LOGS_RAW > 0 ? MAX_POSTED_LOGS_RAW : 40;

function readJsonFileSafe(filePath, fallbackValue, label) {
    if (!fs.existsSync(filePath)) return fallbackValue;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) {
            console.warn(`${label} is empty, using fallback value.`);
            return fallbackValue;
        }
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`Failed to parse ${label}, using fallback value. Reason: ${error.message}`);
        return fallbackValue;
    }
}

function isValidLinkedInVacancy(job) {
    if (!job || !job.id) return false;
    const title = String(job.title || '').trim();
    const company = String(job.company || '').trim();
    const link = String(job.link || '').trim();
    if (!title || title === 'Unknown Title') return false;
    if (!company || company === 'Unknown Company') return false;
    if (!link || !/^https?:\/\/www\.linkedin\.com\/jobs\/view\/\d+/i.test(link)) return false;
    return true;
}

function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value) {
    return normalizeWhitespace(value)
        .toLowerCase()
        .replace(/\bwith verification\b/g, '')
        .trim();
}

function postedToHours(postedValue) {
    const posted = normalizePosted(postedValue).toLowerCase();
    if (!posted) return null;

    if (/(just\s*posted|today|yesterday|right\s*now|few\s+minutes|moments?\s+ago|new\s+today|<\s*1\s*d|сегодня|вчера)/i.test(posted)) {
        return /(yesterday|вчера)/i.test(posted) ? 24 : 0;
    }

    // Support absolute timestamps from <time datetime="..."> if present.
    const absoluteMs = Date.parse(posted);
    if (Number.isFinite(absoluteMs)) {
        const deltaHours = (Date.now() - absoluteMs) / (1000 * 60 * 60);
        if (Number.isFinite(deltaHours) && deltaHours >= 0) return deltaHours;
    }

    let match = posted.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|минут\S*)/i);
    if (match) return Number.parseFloat(match[1]) / 60;

    match = posted.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|час\S*)/i);
    if (match) return Number.parseFloat(match[1]);

    match = posted.match(/(\d+(?:\.\d+)?)\s*(d|day|days|дн\S*|день|дня)/i);
    if (match) return Number.parseFloat(match[1]) * 24;

    match = posted.match(/(\d+(?:\.\d+)?)\s*(w|week|weeks|недел\S*)/i);
    if (match) return Number.parseFloat(match[1]) * 24 * 7;

    match = posted.match(/(\d+(?:\.\d+)?)\s*(mo|month|months|месяц\S*)/i);
    if (match) return Number.parseFloat(match[1]) * 24 * 30;

    match = posted.match(/(\d+(?:\.\d+)?)([hdwmчднм])/i);
    if (match) {
        const value = Number.parseFloat(match[1]);
        const unit = String(match[2]).toLowerCase();
        if (!Number.isFinite(value)) return null;
        if (unit === 'h' || unit === 'ч') return value;
        if (unit === 'd' || unit === 'д') return value * 24;
        if (unit === 'w' || unit === 'н') return value * 24 * 7;
        if (unit === 'm' || unit === 'м') return value / 60;
    }

    return null;
}

function isTodayPosted(postedValue) {
    const hours = postedToHours(postedValue);
    if (!Number.isFinite(hours)) return false;
    return hours < 24;
}

function runTodayStatsMode() {
    const parsedVacancies = readJsonFileSafe(LINKEDIN_VACANCIES_PATH, [], 'data/vacancies_scrape_linkedin.json');
    const vacancies = Array.isArray(parsedVacancies) ? parsedVacancies.filter(isValidLinkedInVacancy) : [];
    const today = [];
    const notToday = [];
    const unknown = [];

    for (const job of vacancies) {
        const raw = String(job.posted || '').trim();
        const normalized = normalizePosted(raw);
        const hours = postedToHours(normalized);
        if (!Number.isFinite(hours)) {
            unknown.push({ id: job.id, posted: normalized || raw || '(empty)' });
            continue;
        }
        if (hours < 24) {
            today.push({ id: job.id, posted: normalized, hours });
        } else {
            notToday.push({ id: job.id, posted: normalized, hours });
        }
    }

    console.log('LinkedIn today-stats mode (local file, no scraping):');
    console.log(`  File: ${path.relative(ROOT, LINKEDIN_VACANCIES_PATH)}`);
    console.log(`  Total valid vacancies: ${vacancies.length}`);
    console.log(`  Today (<24h): ${today.length}`);
    console.log(`  Not today (>=24h): ${notToday.length}`);
    console.log(`  Unknown posted format: ${unknown.length}`);

    const sample = unknown.slice(0, 12);
    if (sample.length > 0) {
        console.log('  Unknown posted samples:');
        sample.forEach((row, idx) => console.log(`    ${idx + 1}. ${row.id} | ${row.posted}`));
    }
}

function titleCompanyKey(title, company) {
    return `${normalizeComparableText(title)}||${normalizeComparableText(company)}`;
}

async function fetchExistingLinkedinTitleCompanyKeys() {
    const env = loadEnvFile(ENV_PATH);
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.warn('SUPABASE_URL or SUPABASE_KEY not set — skipping Supabase title+company dedup (will rely on local seen_ids only).');
        return new Set();
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const keys = new Set();
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from('vacancies')
            .select('title, company')
            .eq('source', 'linkedin')
            .range(from, to);

        if (error) {
            throw new Error(`Failed to load existing LinkedIn vacancies from Supabase: ${error.message}`);
        }

        const rows = Array.isArray(data) ? data : [];
        rows.forEach((row) => {
            const key = titleCompanyKey(row.title, row.company);
            if (key !== '||') keys.add(key);
        });

        if (rows.length < pageSize) break;
        from += pageSize;
    }

    return keys;
}

function withStartParam(rawUrl, start) {
    const url = new URL(rawUrl);
    url.searchParams.set('start', String(start));
    return url.toString();
}

async function isAuthWall(page) {
    const currentUrl = page.url();
    if (/linkedin\.com\/(?:login|checkpoint|authwall|uas\/login)/i.test(currentUrl)) {
        return true;
    }

    const selectors = [
        '#authwall',
        '.authwall',
        'form[action*="login"]',
        'input#username',
        'input[name="session_password"]',
        '[data-tracking-control-name="guest_homepage-basic_nav-header-signin"]',
    ];

    for (const selector of selectors) {
        const visible = await page.locator(selector).first().isVisible({ timeout: 500 }).catch(() => false);
        if (visible) return true;
    }

    return false;
}

function isExecutionContextDestroyedError(error) {
    return /Execution context was destroyed|Cannot find context with specified id|Most likely the page has been closed/i.test(
        String(error && error.message ? error.message : error)
    );
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

function randomDelayMs(minMs, maxMs) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluateWithNavigationRetry(page, fn, arg, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await page.evaluate(fn, arg);
        } catch (error) {
            lastError = error;
            if (!isExecutionContextDestroyedError(error) || attempt === retries) {
                throw error;
            }
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => { });
            await sleep(800);
        }
    }
    throw lastError;
}

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

async function dismissBlockingUi(page) {
    const dismissSelectors = [
        'button[aria-label*="Dismiss"]',
        'button[aria-label*="Close"]',
        'button[aria-label*="Закрыть"]',
        'button[aria-label*="Отклонить"]',
        'button[data-test-modal-close-btn]',
    ];
    for (const selector of dismissSelectors) {
        const btn = page.locator(selector).first();
        const visible = await btn.isVisible({ timeout: 400 }).catch(() => false);
        if (visible) {
            await btn.click({ timeout: 1000 }).catch(() => { });
            await sleep(300);
        }
    }
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
                    const titleText = titleEl ? titleEl.innerText.trim() : '';
                    const companyText = companyEl ? companyEl.innerText.trim() : '';
                    const canonicalLink = href ? href.split('?')[0] : '';
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

async function enrichVacanciesWithDetails(context, jobs, options) {
    const limit = Math.min(options.limit, jobs.length);
    if (!limit) return;

    console.log(`Enriching first ${limit} vacancy card(s) with details...`);
    for (let index = 0; index < limit; index += 1) {
        const job = jobs[index];
        if (!job || !job.link) continue;

        const detailPage = await context.newPage();
        try {
            await detailPage.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
            const stayOnCardMs = randomDelayMs(2000, 5000);
            console.log(`Opened card ${index + 1}/${limit}: waiting ${stayOnCardMs}ms before reading description...`);
            await sleep(stayOnCardMs);

            const details = await evaluateWithNavigationRetry(detailPage, () => {
                const descriptionSelectors = [
                    '.jobs-description__content .jobs-box__html-content',
                    '.jobs-description__content',
                    '.jobs-box__html-content',
                    '.jobs-description-content__text',
                    '[data-test-job-description]',
                ];

                const descCandidates = descriptionSelectors
                    .map((selector) => {
                        const el = document.querySelector(selector);
                        return el ? (el.innerText || el.textContent || '') : '';
                    })
                    .map((text) => text.replace(/\s+/g, ' ').trim())
                    .filter(Boolean);

                let description = '';
                if (descCandidates.length) {
                    description = descCandidates.sort((a, b) => b.length - a.length)[0];
                }

                const contacts = [];
                const addContact = (contact) => {
                    if (!contact || !contact.value) return;
                    const key = `${contact.type || 'unknown'}::${String(contact.value).toLowerCase()}`;
                    if (!contacts.some((c) => `${c.type || 'unknown'}::${String(c.value).toLowerCase()}` === key)) {
                        contacts.push(contact);
                    }
                };

                const hiringSectionSelectors = [
                    '[data-test-meet-the-hiring-team]',
                    '[data-test-job-poster]',
                    '.jobs-poster',
                    '.jobs-poster__container',
                    '.hirer-card__hirer-information',
                    '.job-details-people-who-can-help__connections-profile-card',
                    '[class*="job-details-people-who-can-help"]',
                ];

                const hiringSections = Array.from(document.querySelectorAll(hiringSectionSelectors.join(', ')));
                hiringSections.forEach((section) => {
                    const nameText = (
                        section.querySelector('.job-details-people-who-can-help__connections-profile-card-title strong')?.textContent ||
                        section.querySelector('h3, h2, strong')?.textContent ||
                        ''
                    ).replace(/\s+/g, ' ').trim();
                    const roleText = (
                        section.querySelector('.job-details-people-who-can-help__connections-profile-card-subtitle')?.textContent ||
                        section.querySelector('.artdeco-entity-lockup__subtitle')?.textContent ||
                        section.querySelector('p, .t-14, .t-12, span')?.textContent ||
                        ''
                    ).replace(/\s+/g, ' ').trim();
                    const canMessage = /send message|отправить сообщение|enviar mensagem|enviar mensaje/i.test(
                        (section.textContent || '').replace(/\s+/g, ' ').trim()
                    );
                    section.querySelectorAll('a[href]').forEach((a) => {
                        const hrefRaw = (a.getAttribute('href') || '').trim();
                        if (!hrefRaw) return;
                        const href = hrefRaw.startsWith('http') ? hrefRaw : new URL(hrefRaw, window.location.origin).toString();
                        if (/linkedin\.com\/in\//i.test(href)) {
                            addContact({
                                type: 'hiring_team_profile',
                                value: href,
                                name: nameText || (a.textContent || '').replace(/\s+/g, ' ').trim() || null,
                                role: roleText || null,
                                can_message: canMessage,
                                url: href,
                            });
                        }
                    });
                });

                const emailSet = new Set();
                document.querySelectorAll('a[href^=\"mailto:\"]').forEach((a) => {
                    const href = (a.getAttribute('href') || '').trim();
                    const email = href.replace(/^mailto:/i, '').trim().toLowerCase();
                    if (!email) return;
                    emailSet.add(email);
                });

                const textForEmail = [description, document.body?.innerText || ''].join('\n');
                const emailMatches = textForEmail.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
                emailMatches.forEach((email) => {
                    const e = String(email).trim().toLowerCase();
                    if (e) emailSet.add(e);
                });

                const emails = Array.from(emailSet).slice(0, 10);
                emails.forEach((email) => {
                    addContact({
                        type: 'email',
                        value: email,
                        url: `mailto:${email}`,
                    });
                });

                const recruiterName =
                    contacts.find((c) => c.type === 'hiring_team_profile' && c.name)?.name || null;

                return {
                    description,
                    contacts,
                    emails,
                    recruiterName,
                };
            });

            job.description = normalizeWhitespace(details.description || '');
            if (Array.isArray(details.contacts) && details.contacts.length > 0) {
                job.contacts = details.contacts;
            } else {
                delete job.contacts;
            }
            if (Array.isArray(details.emails) && details.emails.length > 0) {
                job.emails = details.emails;
            } else {
                delete job.emails;
            }
            if (details.recruiterName) {
                job.recruiter_name = details.recruiterName;
            } else {
                delete job.recruiter_name;
            }
            job.enriched_at = new Date().toISOString();
            console.log(
                `Enriched ${index + 1}/${limit}: ${job.id} | description=${job.description.length} chars | contacts=${(job.contacts || []).length} | emails=${(job.emails || []).length}`
            );
        } catch (error) {
            console.warn(`Failed to enrich ${job.id}: ${error.message}`);
        } finally {
            await detailPage.close().catch(() => { });
        }
    }
}

(async () => {
    let browser;
    let context;

    try {
        if (TODAY_STATS_MODE) {
            runTodayStatsMode();
            return;
        }
        console.log('Starting LinkedIn scraper...');
        console.log('Step 1/3: loading existing LinkedIn title+company from Supabase...');

        let supabaseExistingKeys;
        try {
            supabaseExistingKeys = await fetchExistingLinkedinTitleCompanyKeys();
            console.log(`Supabase existing LinkedIn entries: ${supabaseExistingKeys.size}`);
        } catch (err) {
            console.warn(`Could not load Supabase dedup keys: ${err.message}. Continuing without Supabase dedup.`);
            supabaseExistingKeys = new Set();
        }

        const configPath = path.resolve(__dirname, '..', 'config', 'search_config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const liConfig = config.portals.find((p) => p.name === 'linkedin');
        const pageSize = config.settings.linkedin_page_size || 25;
        const daysAgoDays = config.settings.linkedin_days_ago || 3;
        const hoursAgo = Number(config.settings.linkedin_hours_ago || (daysAgoDays * 24));
        const now = new Date();
        const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const postedWindowSeconds = LINKEDIN_ONLY_TODAY
            ? Math.max(60, secondsSinceMidnight)
            : Math.max(3600, Math.round(hoursAgo * 60 * 60));
        const usePersistentProfile = Boolean(config.settings.linkedin_use_persistent_profile);
        const enrichFirstNRaw = config.settings.linkedin_enrich_first_n;
        const enrichAll = String(enrichFirstNRaw).toLowerCase() === 'all';
        const enrichFirstN = enrichAll ? Number.MAX_SAFE_INTEGER : Math.max(0, Number(enrichFirstNRaw || 0));
        const persistentProfileDir = path.resolve(__dirname, '..', 'auth', 'linkedin_profile');

        if (!liConfig || !liConfig.enabled) {
            console.log('LinkedIn is disabled in config.');
            return;
        }
        if (LINKEDIN_ONLY_TODAY) {
            console.log(`LinkedIn recency mode: today only (posted <24h, query window r${postedWindowSeconds}s).`);
        }

        const seenIdsPath = path.resolve(__dirname, '..', 'data', 'seen_ids.json');
        const parsedSeen = readJsonFileSafe(seenIdsPath, [], 'data/seen_ids.json');
        let seenIds = Array.isArray(parsedSeen) ? parsedSeen : [];
        const seenSet = new Set(seenIds);

        const vacanciesPath = path.resolve(__dirname, '..', 'data', 'vacancies_scrape_linkedin.json');
        const parsedVacancies = readJsonFileSafe(vacanciesPath, [], 'data/vacancies_scrape_linkedin.json');
        let allVacancies = Array.isArray(parsedVacancies) ? parsedVacancies.filter(isValidLinkedInVacancy) : [];
        if (LINKEDIN_ONLY_TODAY) {
            allVacancies = allVacancies.filter((job) => isTodayPosted(job.posted));
        }
        allVacancies = allVacancies.filter((job) => isPortugalVacancy(job));
        allVacancies = allVacancies.map((job) => {
            const cleaned = { ...job };
            return cleaned;
        });

        const existingMap = new Map();
        allVacancies.forEach((v) => existingMap.set(v.id, v));

        if (usePersistentProfile) {
            console.log(`Auth mode: persistent profile (${persistentProfileDir})`);
            context = await chromium.launchPersistentContext(persistentProfileDir, {
                headless: false,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 800 },
            });
        } else {
            browser = await chromium.launch({ headless: false });
            const authPath = path.resolve(__dirname, '..', liConfig.authStateFile);
            if (!fs.existsSync(authPath)) {
                console.warn(`Missing auth file: ${liConfig.authStateFile}`);
                console.warn('Skipping LinkedIn parsing. Authenticate first.');
                return;
            }

            const authState = JSON.parse(fs.readFileSync(authPath, 'utf8'));
            const validStorageState = authState && Array.isArray(authState.cookies) && Array.isArray(authState.origins);
            if (!validStorageState) {
                throw new Error(
                    `Invalid storage state in ${liConfig.authStateFile}. Recreate it via: npm run auth:linkedin`
                );
            }

            context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 800 },
                storageState: authPath,
            });
        }

        let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

        let totalScraped = 0;
        let newFound = 0;
        let skippedNotToday = 0;
        let skippedNotPortugal = 0;
        let postedLogCount = 0;

        for (let baseUrl of liConfig.searchUrls) {
            const queryCollectedIds = new Set();
            const queryCollectedJobs = [];
            let querySkippedExisting = 0;
            let queryDeclaredTotal = null;
            let queryDeclaredText = '';
            let queryUiPages = null;
            let totalPagesForQuery = 1;
            const hardMaxPages = 50;
            try {
                const urlObj = new URL(baseUrl);
                urlObj.searchParams.set('f_TPR', `r${postedWindowSeconds}`);
                baseUrl = urlObj.toString();
            } catch (e) {
                // Ignore if baseUrl is not a valid URL
            }

            console.log(`Searching: ${baseUrl}`);
            await sleep(3000 + Math.random() * 2000);
            let emptyPagesInRow = 0;

            for (let pageIndex = 0; pageIndex < totalPagesForQuery; pageIndex += 1) {
                if (!page || page.isClosed()) {
                    page = await context.newPage();
                    console.warn('LinkedIn page was closed. Opened a new page and continuing.');
                }
                const start = pageIndex * pageSize;
                const pageUrl = withStartParam(baseUrl, start);
                const currentPage = pageIndex + 1;
                console.log(`Page ${currentPage}/${totalPagesForQuery} start=${start}...`);

                await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await sleep(config.settings.delay_between_pages_ms || 4000);

                if (await isAuthWall(page)) {
                    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const debugPath = path.resolve(__dirname, '..', 'reports', `linkedin_authwall_${stamp}.png`);
                    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => { });
                    throw new Error(
                        `LinkedIn redirected to login/authwall. Refresh session with: ${usePersistentProfile ? 'npm run auth:linkedin:profile' : 'npm run auth:linkedin'}. Debug screenshot: ${debugPath}`
                    );
                }

                if (pageIndex === 0) {
                    const declaredInfo = await readDeclaredVacancyCount(page);
                    queryDeclaredText = declaredInfo.text || '';
                    queryDeclaredTotal = parseCountFromText(queryDeclaredText);
                    if (queryDeclaredTotal !== null) {
                        console.log(`LinkedIn declared total: ${queryDeclaredTotal} (${queryDeclaredText})`);
                    } else {
                        console.log('LinkedIn declared total: not found');
                    }

                    queryUiPages = await readPaginationTotalPages(page);
                    if (queryUiPages && Number.isFinite(queryUiPages)) {
                        totalPagesForQuery = queryUiPages;
                        console.log(`LinkedIn pagination shows ${queryUiPages} page(s).`);
                    } else if (queryDeclaredTotal !== null) {
                        totalPagesForQuery = Math.max(1, Math.ceil(queryDeclaredTotal / pageSize));
                        console.log(`LinkedIn pagination fallback: estimated ${totalPagesForQuery} page(s) from declared total.`);
                    }
                    if (totalPagesForQuery > hardMaxPages) {
                        console.warn(`Pagination limit guard: ${totalPagesForQuery} -> ${hardMaxPages}`);
                        totalPagesForQuery = hardMaxPages;
                    }
                }

                await evaluateWithNavigationRetry(page, () => {
                    const list = document.querySelector('.jobs-search-results-list');
                    if (list) {
                        list.scrollTo(0, list.scrollHeight);
                    } else {
                        window.scrollTo(0, document.body.scrollHeight);
                    }
                });
                await sleep(2000);

                if (await isAuthWall(page)) {
                    throw new Error(
                        `LinkedIn session became unauthorized during page processing. Run: ${usePersistentProfile ? 'npm run auth:linkedin:profile' : 'npm run auth:linkedin'}`
                    );
                }

                const jobs = await extractJobsWithRetry(page, liConfig.selectors, 3);

                if (jobs.length === 0) {
                    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const screenshotPath = path.resolve(__dirname, '..', 'reports', `linkedin_zero_jobs_${stamp}.png`);
                    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { });
                    emptyPagesInRow += 1;
                    console.log(`No jobs on this page. Debug screenshot: ${screenshotPath}`);
                    if (emptyPagesInRow >= 2) {
                        console.log('Stopping this query after 2 empty pages in a row.');
                        break;
                    }
                    if (currentPage < totalPagesForQuery) {
                        const pageSwitchDelayMs = randomDelayMs(2000, 5000);
                        console.log(`Waiting ${pageSwitchDelayMs}ms before switching to next page...`);
                        await sleep(pageSwitchDelayMs);
                    }
                    continue;
                }
                emptyPagesInRow = 0;

                for (const job of jobs) {
                    if (!isValidLinkedInVacancy(job)) {
                        continue;
                    }
                    const postedRaw = String(job.posted || '').trim();
                    job.posted = normalizePosted(job.posted);
                    job.posted_days = getPostedDays(job.posted);
                    const postedHours = postedToHours(job.posted);
                    const compactAge = /\b\d+(?:\.\d+)?\s*[hdwm]\b/i.test(postedRaw);
                    const phraseAge = /(just\s*posted|today|minutes?|hours?|days?|weeks?)/i.test(postedRaw);
                    const shouldLogPosted = LOG_POSTED_NORMALIZATION
                        && postedLogCount < MAX_POSTED_LOGS
                        && (compactAge || phraseAge || !Number.isFinite(postedHours));
                    if (shouldLogPosted) {
                        const hoursText = Number.isFinite(postedHours) ? postedHours.toFixed(2) : 'n/a';
                        console.log(`[posted-normalize] ${job.id} | raw="${postedRaw}" -> normalized="${job.posted}" | hours=${hoursText}`);
                        postedLogCount += 1;
                    }
                    if (LINKEDIN_ONLY_TODAY && !isTodayPosted(job.posted)) {
                        skippedNotToday += 1;
                        continue;
                    }
                    if (!isPortugalVacancy(job)) {
                        skippedNotPortugal += 1;
                        continue;
                    }
                    const key = titleCompanyKey(job.title, job.company);
                    if (supabaseExistingKeys.has(key)) {
                        querySkippedExisting += 1;
                        continue;
                    }
                    supabaseExistingKeys.add(key);

                    totalScraped += 1;
                    queryCollectedIds.add(job.id);
                    if (!queryCollectedJobs.find((v) => v.id === job.id)) {
                        queryCollectedJobs.push(job);
                    }
                    existingMap.set(job.id, job);

                    if (!seenSet.has(job.id)) {
                        newFound += 1;
                        seenSet.add(job.id);
                        seenIds.push(job.id);
                    }
                }

                console.log(`Extracted ${jobs.length} jobs.`);

                if (currentPage < totalPagesForQuery) {
                    const pageSwitchDelayMs = randomDelayMs(2000, 5000);
                    console.log(`Waiting ${pageSwitchDelayMs}ms before switching to next page...`);
                    await sleep(pageSwitchDelayMs);
                }
            }

            if (enrichFirstN > 0 && queryCollectedJobs.length > 0) {
                console.log(`Step 3/3: opening job details only for NEW vacancies (${queryCollectedJobs.length})...`);
                await enrichVacanciesWithDetails(context, queryCollectedJobs, {
                    limit: enrichFirstN,
                });
                queryCollectedJobs.forEach((job) => {
                    if (isValidLinkedInVacancy(job)) {
                        existingMap.set(job.id, job);
                    }
                });
            }

            if (queryDeclaredTotal !== null) {
                const collected = queryCollectedIds.size;
                const delta = Math.abs(collected - queryDeclaredTotal);
                console.log(`Skipped as already in Supabase (title+company): ${querySkippedExisting}`);
                if (LINKEDIN_ONLY_TODAY) {
                    console.log(`LinkedIn count check (today-filtered): declared=${queryDeclaredTotal}, keptToday=${collected}`);
                } else {
                    if (delta <= 2) {
                        console.log(`LinkedIn count check OK: declared=${queryDeclaredTotal}, collected=${collected}`);
                    } else if (totalPagesForQuery < Math.ceil(queryDeclaredTotal / pageSize) && collected < queryDeclaredTotal) {
                        console.warn(
                            `LinkedIn count check PARTIAL: declared=${queryDeclaredTotal}, collected=${collected}, usedPages=${totalPagesForQuery}, requiredPages=${Math.ceil(queryDeclaredTotal / pageSize)}`
                        );
                    } else {
                        console.warn(`LinkedIn count check MISMATCH: declared=${queryDeclaredTotal}, collected=${collected}`);
                    }
                }
            }
        }

        const finalVacancies = (LINKEDIN_ONLY_TODAY
            ? Array.from(existingMap.values()).filter((job) => isTodayPosted(job.posted))
            : Array.from(existingMap.values()))
            .filter((job) => isPortugalVacancy(job));

        fs.writeFileSync(vacanciesPath, JSON.stringify(finalVacancies, null, 2));
        fs.writeFileSync(seenIdsPath, JSON.stringify(seenIds, null, 2));

        console.log(`Done. Scraped ${totalScraped} total LinkedIn jobs.`);
        console.log(`Found ${newFound} new jobs.`);
        if (LINKEDIN_ONLY_TODAY) {
            console.log(`Skipped as not-today: ${skippedNotToday}`);
        }
        console.log(`Skipped by region (not Portugal): ${skippedNotPortugal}`);
        if (LOG_POSTED_NORMALIZATION) {
            console.log(`Posted normalization logs emitted: ${postedLogCount}/${MAX_POSTED_LOGS}`);
        }
        console.log(`Saved to data/vacancies_scrape_linkedin.json (total: ${finalVacancies.length}).`);
    } catch (error) {
        console.error('LinkedIn parser failed:', error.message);
        process.exitCode = 1;
    } finally {
        if (context) {
            try {
                await context.close();
            } catch (_) {
                // Ignore close errors.
            }
        }
        if (browser) {
            try {
                await browser.close();
            } catch (_) {
                // Ignore close errors.
            }
        }
    }
})();
