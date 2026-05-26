/**
 * parse_linkedin.js - automatic LinkedIn scraping via Playwright.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const appConfig = require('./lib/config');
const { mergeVacancyRecords } = require('./lib/merge_utils');
const { normalizePosted, getPostedDays, parsePostedAge, isPortugalVacancy } = require('./lib/vacancy_utils');
const { normalizeWhitespace } = require('./lib/text_utils');

// Modules
const { isAuthWall } = require('./lib/linkedin/auth');
const { sleep, randomDelayMs } = require('./lib/linkedin/utils');
const { readDeclaredVacancyCount, readPaginationTotalPages, extractJobsWithRetry, parseCountFromText } = require('./lib/linkedin/search_results');
const { openNotificationJobsTab, resolveNotificationTarget, isValidLinkedInVacancy } = require('./lib/linkedin/notifications');
const { enrichVacanciesWithDetails } = require('./lib/linkedin/job_details');

const ROOT = appConfig.ROOT;
const ENV_PATH = appConfig.ENV_PATH;
const LINKEDIN_VACANCIES_PATH = path.resolve(ROOT, 'data', 'vacancies_scrape_linkedin.json');
const runtimeEnv = appConfig.env;
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


function normalizeComparableText(value) {
    return normalizeWhitespace(value)
        .toLowerCase()
        .replace(/\bwith verification\b/g, '')
        .trim();
}

function postedToHours(postedValue) {
    const parsed = parsePostedAge(postedValue);
    if (!parsed || !Number.isFinite(parsed.value)) return null;
    if (parsed.unit === 'm') return parsed.value / 60;
    if (parsed.unit === 'h') return parsed.value;
    if (parsed.unit === 'd') return parsed.value * 24;
    if (parsed.unit === 'w') return parsed.value * 24 * 7;
    if (parsed.unit === 'mo') return parsed.value * 24 * 30;
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
    const env = appConfig.env;
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.warn('SUPABASE_URL or SUPABASE_KEY not set — skipping Supabase title+company dedup.');
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

function upsertLinkedinVacancy(existingMap, vacancy) {
    const existing = existingMap.get(vacancy.id);
    if (!existing) {
        existingMap.set(vacancy.id, vacancy);
        return vacancy;
    }

    const merged = mergeVacancyRecords(existing, vacancy);
    existingMap.set(vacancy.id, merged);
    return merged;
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
        const persistentProfileDir = appConfig.LINKEDIN_PROFILE_DIR;

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
                channel: 'chrome',
                headless: false,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 800 },
            });
        } else {
            browser = await chromium.launch({ headless: false, channel: 'chrome' });
            const authPath = appConfig.LINKEDIN_STATE_PATH;
            if (!fs.existsSync(authPath)) {
                console.warn(`Missing auth file: ${authPath}`);
                console.warn('Skipping LinkedIn parsing. Authenticate first.');
                return;
            }

            const authState = JSON.parse(fs.readFileSync(authPath, 'utf8'));
            const validStorageState = authState && Array.isArray(authState.cookies) && Array.isArray(authState.origins);
            if (!validStorageState) {
                throw new Error(
                    `Invalid storage state in ${authPath}. Recreate it via: npm run auth:linkedin`
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
        let notificationSignalsAdded = 0;

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
                    if (!isValidLinkedInVacancy(job)) continue;
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

        try {
            console.log('Starting LinkedIn notifications pass...');
            const notifications = await openNotificationJobsTab(page);
            const notificationCollectedMap = new Map();

            if (notifications.length > 0) {
                console.log(`Processing ${notifications.length} LinkedIn notification job signal(s)...`);
            }

            for (const notification of notifications) {
                const jobs = await resolveNotificationTarget(context, liConfig.selectors, notification);
                for (const job of jobs) {
                    if (!isValidLinkedInVacancy(job)) continue;

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

                    const existingLocal = existingMap.get(job.id);
                    if (existingLocal) {
                        const mergedLocal = upsertLinkedinVacancy(existingMap, job);
                        notificationCollectedMap.set(mergedLocal.id, mergedLocal);
                        notificationSignalsAdded += 1;
                        continue;
                    }

                    const key = titleCompanyKey(job.title, job.company);
                    if (supabaseExistingKeys.has(key)) continue;
                    supabaseExistingKeys.add(key);

                    totalScraped += 1;
                    const mergedNew = upsertLinkedinVacancy(existingMap, job);
                    notificationCollectedMap.set(mergedNew.id, mergedNew);
                    if (!seenSet.has(mergedNew.id)) {
                        newFound += 1;
                        seenSet.add(mergedNew.id);
                        seenIds.push(mergedNew.id);
                    }
                    notificationSignalsAdded += 1;
                }
            }

            const notificationCollectedJobs = Array.from(notificationCollectedMap.values());
            if (enrichFirstN > 0 && notificationCollectedJobs.length > 0) {
                console.log(`Step 3.5/3: opening notification-discovered job details (${notificationCollectedJobs.length})...`);
                await enrichVacanciesWithDetails(context, notificationCollectedJobs, {
                    limit: enrichFirstN,
                });
                notificationCollectedJobs.forEach((job) => {
                    if (isValidLinkedInVacancy(job)) {
                        existingMap.set(job.id, job);
                    }
                });
            }
        } catch (error) {
            console.warn(`LinkedIn notifications pass failed: ${error.message}`);
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
        if (notificationSignalsAdded > 0) {
            console.log(`LinkedIn notification signals applied: ${notificationSignalsAdded}`);
        }
        if (LOG_POSTED_NORMALIZATION) {
            console.log(`Posted normalization logs emitted: ${postedLogCount}/${MAX_POSTED_LOGS}`);
        }
        console.log(`Saved to data/vacancies_scrape_linkedin.json (total: ${finalVacancies.length}).`);
    } catch (error) {
        console.error('LinkedIn parser failed:', error.message);
        process.exitCode = 1;
    } finally {
        if (context) {
            try { await context.close(); } catch (_) { console.warn('LinkedIn context close failed:', _.message); }
        }
        if (browser) {
            try { await browser.close(); } catch (_) { console.warn('LinkedIn browser close failed:', _.message); }
        }
    }
})();
