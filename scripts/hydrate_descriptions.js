const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadEnvFile } = require('./lib/env');
const { normalizeWhitespace } = require('./lib/text_utils');

const ROOT = path.resolve(__dirname, '..');
const VACANCIES_PATH = path.join(ROOT, 'data', 'vacancies.json');
const ENV_PATH = path.join(ROOT, '.env');
const LINKEDIN_PROFILE_DIR = path.join(ROOT, 'auth', 'linkedin_profile');

const normalizeSpace = normalizeWhitespace;

function escapeTelegramText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

async function sendTelegramErrorReport(items) {
    if (!Array.isArray(items) || items.length === 0) return;

    const TARGET_ROLE_REGEX = /(sre|devops|platform|site\s+reliability|infrastructure|data\s+engineer|data\s+platform|ai\s+agent|ai\s+engineer|ml\s+engineer|machine\s+learning)/i;
    const targetItems = items.filter((item) => TARGET_ROLE_REGEX.test(item.title));
    if (targetItems.length === 0) return;

    const env = loadEnvFile(ENV_PATH);
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    const topicId = env.TELEGRAM_TOPIC_ID;
    if (!botToken || !chatId) return;

    const header = [
        'Score pipeline warning: missing descriptions',
        `Date: ${new Date().toISOString()}`,
        `Count: ${targetItems.length}`,
        '',
    ];

    const lines = targetItems.slice(0, 20).map((item, index) =>
        `${index + 1}. ${escapeTelegramText(item.title)} | ${escapeTelegramText(item.company)}\n   ${item.link}\n   Error: ${escapeTelegramText(item.error)}`
    );

    const text = [...header, ...lines].join('\n').slice(0, 3900);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: topicId ? Number.parseInt(topicId, 10) : undefined,
            text,
            disable_web_page_preview: true,
        }),
    }).catch(() => {});
}

async function extractDescriptionFromPage(page) {
    try {
        return await page.evaluate(() => {
            const expandSelectors = [
                'button[aria-label*="See more"]',
                'button[aria-label*="Show more"]',
                '.jobs-description__footer-button',
                'button[action-type="DENY"]',
                'button[action-type="ACCEPT"]'
            ];
            for (const selector of expandSelectors) {
                const button = document.querySelector(selector);
                if (button) {
                    button.click();
                }
            }

            const selectors = [
                '#job-details',
                '.show-more-less-html__markup',
                '.core-section-container__content',
                '.jobs-description__content .jobs-box__html-content',
                '.jobs-description__content',
                '.jobs-box__html-content',
                '.jobs-description-content__text',
                '.description__text',
                '#JobDescriptionContainer',
                '[data-test-job-description]',
                '[data-test="jobDescription"]',
                '[data-test="description"]',
                '.jobDescriptionContent',
                'article'
            ];

            const candidates = selectors
                .map((selector) => {
                    const element = document.querySelector(selector);
                    return element ? (element.innerText || element.textContent || '') : '';
                })
                .map((text) => text.replace(/\s+/g, ' ').trim())
                .filter(Boolean);

            if (candidates.length === 0) return '';
            return candidates.sort((a, b) => b.length - a.length)[0];
        });
    } catch (_) {
        return '';
    }
}

async function hydrateMissingDescriptions(vacancies) {
    const maxAgeMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    const missing = vacancies.filter((vacancy) => {
        if (vacancy.closed) return false;
        if (normalizeSpace(vacancy.description)) return false;
        if (!normalizeSpace(vacancy.link)) return false;
        if (vacancy.enriched_at) {
            const ageMs = Date.now() - new Date(vacancy.enriched_at).getTime();
            if (ageMs > maxAgeMs) return false;
        }
        return true;
    });
    if (missing.length === 0) return { filled: 0, failed: [] };

    console.log(`Description hydrate: ${missing.length} vacancies missing description.`);

    let browser = null;
    let genericContext = null;
    let linkedInContext = null;
    const failed = [];
    let filled = 0;

    try {
        browser = await chromium.launch({ headless: true });
        genericContext = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
        });

        if (fs.existsSync(LINKEDIN_PROFILE_DIR)) {
            linkedInContext = await chromium.launchPersistentContext(LINKEDIN_PROFILE_DIR, {
                headless: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 800 },
            });
        }

        for (const vacancy of missing) {
            const link = normalizeSpace(vacancy.link);
            const isLinkedIn = /linkedin\.com\/jobs\/view\//i.test(link);
            const context = isLinkedIn && linkedInContext ? linkedInContext : genericContext;
            const page = await context.newPage();

            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
            });

            try {
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

                // Wait for any known description selector to appear (up to 10s), then fall back to static delay
                const descSelectors = [
                    '#job-details',
                    '.show-more-less-html__markup',
                    '.jobs-description__content',
                    '.jobs-box__html-content',
                    '#JobDescriptionContainer',
                    '[data-test-job-description]',
                    'article',
                ];
                try {
                    await page.waitForSelector(descSelectors.join(', '), { timeout: 10000 });
                    await page.waitForTimeout(500); // brief settle after selector appears
                } catch (_) {
                    // No selector found within 10s — fall back to static delay
                    await page.waitForTimeout(4000);
                }

                const isClosed = await page.evaluate(() => {
                    const closedPatterns = [
                        /no longer accepting applications/i,
                        /this job is closed/i,
                        /applications are closed/i,
                        /this listing has expired/i,
                        /no longer available for applications/i,
                        /job expired/i,
                        /заявки на эту вакансию больше не принимаются/i,
                        /вакансия закрыта/i,
                        /прием заявок прекращен/i,
                        /não se aceitam mais candidaturas/i,
                        /esta vaga está fechada/i,
                        /candidaturas encerradas/i,
                        /ya no se aceptan solicitudes/i,
                        /esta oferta está cerrada/i,
                        /plazo de solicitud cerrado/i
                    ];
                    const pageText = document.body ? document.body.innerText : '';
                    return closedPatterns.some((pattern) => pattern.test(pageText));
                });

                if (isClosed) {
                    vacancy.closed = true;
                }

                const description = normalizeSpace(await extractDescriptionFromPage(page));
                if (description) {
                    vacancy.description = description;
                    filled += 1;
                } else if (isClosed) {
                    vacancy.description = '[Closed Vacancy]';
                    filled += 1;
                } else {
                    // Save diagnostic screenshot so we can see authwalls/overlays
                    try {
                        const debugDir = path.join(ROOT, 'reports', 'hydration_debug');
                        fs.mkdirSync(debugDir, { recursive: true });
                        const safeId = String(vacancy.id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
                        await page.screenshot({ path: path.join(debugDir, `${safeId}.png`), fullPage: false });
                    } catch (_) { /* screenshot is best-effort */ }

                    failed.push({
                        id: vacancy.id,
                        title: vacancy.title,
                        company: vacancy.company,
                        link: vacancy.link,
                        error: 'description not found after page load',
                    });
                }
            } catch (error) {
                failed.push({
                    id: vacancy.id,
                    title: vacancy.title,
                    company: vacancy.company,
                    link: vacancy.link,
                    error: error.message,
                });
            } finally {
                await page.close().catch(() => {});
            }
        }
    } finally {
        if (genericContext) await genericContext.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        if (linkedInContext) await linkedInContext.close().catch(() => {});
    }

    return { filled, failed };
}

async function run() {
    if (!fs.existsSync(VACANCIES_PATH)) {
        console.error('data/vacancies.json not found');
        process.exit(1);
    }

    const vacancies = JSON.parse(fs.readFileSync(VACANCIES_PATH, 'utf8'));
    const hydrate = await hydrateMissingDescriptions(vacancies);
    console.log(`Description hydrate done: filled=${hydrate.filled}, failed=${hydrate.failed.length}`);

    if (hydrate.failed.length > 0) {
        await sendTelegramErrorReport(hydrate.failed);
        console.warn('Telegram error report sent for vacancies with unresolved descriptions.');
    }

    fs.writeFileSync(VACANCIES_PATH, JSON.stringify(vacancies, null, 2));
}

run().catch((error) => {
    console.error('hydrate_descriptions failed:', error.message);
    process.exit(1);
});
