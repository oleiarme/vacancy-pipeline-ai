/**
 * parse_glassdoor.js - automatic Glassdoor scraping via Playwright.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./lib/env');
const { normalizePosted, getPostedDays, isPortugalVacancy } = require('./lib/vacancy_utils');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

function normalizeComparableText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function titleCompanyKey(title, company) {
    return `${normalizeComparableText(title)}||${normalizeComparableText(company)}`;
}

async function fetchExistingGlassdoorTitleCompanyKeys() {
    const env = loadEnvFile(ENV_PATH);
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
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
            .eq('source', 'glassdoor')
            .range(from, to);

        if (error) {
            throw new Error(`Failed to load existing Glassdoor vacancies from Supabase: ${error.message}`);
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

(async () => {
    let browser;

    try {
        console.log('Starting Glassdoor scraper...');
        console.log('Step 1/3: loading existing Glassdoor title+company from Supabase...');
        const supabaseExistingKeys = await fetchExistingGlassdoorTitleCompanyKeys();
        console.log(`Supabase existing Glassdoor entries: ${supabaseExistingKeys.size}`);

        const configPath = path.resolve(__dirname, '..', 'config', 'search_config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const gdConfig = config.portals.find((p) => p.name === 'glassdoor');
        const maxPages = config.settings.max_pages_per_search || 3;

        if (!gdConfig || !gdConfig.enabled) {
            console.log('Glassdoor is disabled in config.');
            return;
        }

        const seenIdsPath = path.resolve(__dirname, '..', 'data', 'seen_ids.json');
        let seenIds = [];
        if (fs.existsSync(seenIdsPath)) {
            const parsedSeen = JSON.parse(fs.readFileSync(seenIdsPath, 'utf8'));
            seenIds = Array.isArray(parsedSeen) ? parsedSeen : [];
        }
        const seenSet = new Set(seenIds);

        const vacanciesPath = path.resolve(__dirname, '..', 'data', 'vacancies_scrape_glassdoor.json');
        let allVacancies = [];
        if (fs.existsSync(vacanciesPath)) {
            const parsedVacancies = JSON.parse(fs.readFileSync(vacanciesPath, 'utf8'));
            allVacancies = Array.isArray(parsedVacancies) ? parsedVacancies : [];
        }
        allVacancies = allVacancies.filter((v) => isPortugalVacancy(v));

        const existingMap = new Map();
        allVacancies.forEach((v) => existingMap.set(v.id, v));

        browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        const authPath = path.resolve(__dirname, '..', gdConfig.authStateFile);
        if (!fs.existsSync(authPath)) {
            console.warn(`Missing auth file: ${gdConfig.authStateFile}`);
            console.warn('Skipping Glassdoor parsing. Authenticate first.');
            return;
        }

        const authState = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        await context.addCookies(authState.cookies || []);

        const page = await context.newPage();

        let totalScraped = 0;
        let newFound = 0;
        let skippedByRegion = 0;

        for (const url of gdConfig.searchUrls) {
            console.log(`Searching: ${url}`);
            let currentPage = 1;
            let skippedExisting = 0;
            let skippedByRegionQuery = 0;

            while (currentPage <= maxPages) {
                console.log(`Page ${currentPage}...`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(3000);

                const jobs = await page.evaluate((selectors) => {
                    const results = [];
                    document.querySelectorAll(selectors.vacancyCard).forEach((el) => {
                        const titleEl = el.querySelector(selectors.title);
                        const companyEl = el.querySelector(selectors.company);
                        const linkEl = el.querySelector(`a[data-test="job-link"], ${selectors.link}`);
                        const locationEl = el.querySelector('[data-test="emp-location"]');
                        const ratingEl = el.querySelector('[data-test="rating-star"]');
                        const easyApplyEl = el.querySelector('[data-test="easy-apply"]');
                        const postedEl = el.querySelector('[data-test="job-age"]');

                        const href = linkEl ? linkEl.href : '';
                        let id = '';
                        if (href) {
                            const urlObj = new URL(href, window.location.origin);
                            id =
                                urlObj.searchParams.get('jl') ||
                                urlObj.searchParams.get('jobListingId') ||
                                urlObj.pathname.split('/').pop();
                        }

                        if (id && id !== 'jobListing.htm') {
                            results.push({
                                id,
                                title: titleEl ? titleEl.innerText.trim() : 'Unknown Title',
                                company: companyEl ? companyEl.innerText.trim() : 'Unknown Company',
                                rating: ratingEl ? (ratingEl.innerText.trim() || ratingEl.textContent) : null,
                                location: locationEl ? locationEl.innerText.trim() : null,
                                easyApply: Boolean(easyApplyEl),
                                posted: postedEl ? postedEl.innerText.trim() : '',
                                link: href,
                                source: 'glassdoor',
                            });
                        }
                    });
                    return results;
                }, gdConfig.selectors);

                if (jobs.length === 0) {
                    console.log('No jobs found on this page.');
                    break;
                }

                for (const job of jobs) {
                    if (!isPortugalVacancy(job)) {
                        skippedByRegion += 1;
                        skippedByRegionQuery += 1;
                        continue;
                    }
                    const key = titleCompanyKey(job.title, job.company);
                    if (supabaseExistingKeys.has(key)) {
                        skippedExisting += 1;
                        continue;
                    }
                    supabaseExistingKeys.add(key);

                    totalScraped += 1;
                    job.posted = normalizePosted(job.posted);
                    job.posted_days = getPostedDays(job.posted);
                    existingMap.set(job.id, job);

                    if (!seenSet.has(job.id)) {
                        newFound += 1;
                        seenSet.add(job.id);
                        seenIds.push(job.id);
                    }
                }

                console.log(`Extracted ${jobs.length} jobs.`);

                const nextButton = await page.$(gdConfig.selectors.nextPage);
                if (nextButton && currentPage < maxPages) {
                    const isDisabled = await nextButton.evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true');
                    if (!isDisabled) {
                        await nextButton.click();
                        currentPage += 1;
                        await page.waitForTimeout(config.settings.delay_between_pages_ms || 2000);
                        continue;
                    }
                }

                break;
            }
            console.log(`Skipped as already in Supabase (title+company): ${skippedExisting}`);
            console.log(`Skipped by region (not Portugal): ${skippedByRegionQuery}`);
        }

        fs.writeFileSync(vacanciesPath, JSON.stringify(Array.from(existingMap.values()), null, 2));
        fs.writeFileSync(seenIdsPath, JSON.stringify(seenIds, null, 2));

        console.log(`Done. Scraped ${totalScraped} total jobs.`);
        console.log(`Found ${newFound} new jobs.`);
        console.log(`Skipped by region (not Portugal): ${skippedByRegion}`);
        console.log(`Saved to data/vacancies_scrape_glassdoor.json (total: ${existingMap.size}).`);
    } catch (error) {
        console.error('Glassdoor parser failed:', error.message);
        process.exitCode = 1;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (_) {
                // Ignore close errors.
            }
        }
    }
})();

