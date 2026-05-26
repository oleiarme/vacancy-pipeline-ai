/**
 * notifications.js
 */
const { sleep, dismissBlockingUi, evaluateWithNavigationRetry } = require('./utils');
const { extractJobsWithRetry } = require('./search_results');
const { extractJobFromViewPage } = require('./job_details');
const { applyLinkedinNotificationSignal, normalizeLinkedinNotificationCard } = require('../linkedin_notifications');
const { parseLinkedinJobsHomeCollectionLink, normalizeLinkedinJobsHomeAnchor } = require('../linkedin_jobs_home');

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

async function extractNotificationCards(page) {
    const cards = await evaluateWithNavigationRetry(page, () => {
        const results = [];
        const seen = new Set();
        const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim();
        const candidates = document.querySelectorAll('article, li, .nt-card, .notification-card, [data-view-name*="notification"]');

        candidates.forEach((card) => {
            const links = Array.from(card.querySelectorAll('a[href]'));
            const actionLink = links.find((link) => /\/jobs\//i.test(link.href || ''))
                || links.find((link) => /see jobs?|jobs/i.test(textOf(link)));
            if (!actionLink) return;

            const href = (actionLink.href || actionLink.getAttribute('href') || '').trim();
            if (!href) return;

            const actionLabel = textOf(actionLink);
            const text = textOf(card);
            const posted = textOf(card.querySelector('time, [class*="timestamp"], [class*="time"]'));
            const key = `${href}::${actionLabel}`;
            if (seen.has(key)) return;
            seen.add(key);
            results.push({ text, posted, actionLabel, href });
        });

        return results;
    });

    return cards
        .map((card) => normalizeLinkedinNotificationCard(card))
        .filter((card) => card.isJobNotification);
}

async function openNotificationJobsTab(page) {
    console.log('Opening LinkedIn notifications...');
    await page.goto('https://www.linkedin.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    await dismissBlockingUi(page);

    const clicked = await evaluateWithNavigationRetry(page, () => {
        const labels = ['jobs', '\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438', 'empregos'];
        const nodes = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
        const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim().toLowerCase();
        for (const node of nodes) {
            const combined = `${textOf(node)} ${(node.getAttribute && node.getAttribute('href') || '').toLowerCase()}`;
            if (labels.some((label) => combined.includes(label))) {
                node.click();
                return true;
            }
        }
        return false;
    }).catch(() => false);

    if (clicked) {
        console.log('LinkedIn notifications: jobs tab selected.');
        await sleep(2500);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
    }

    let cards = await extractNotificationCards(page);
    if (cards.length === 0) {
        console.log('LinkedIn notifications: no job cards after tab click, trying direct jobs filter url...');
        await page.goto('https://www.linkedin.com/notifications/?filter=jobs', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => { });
        await sleep(2500);
        cards = await extractNotificationCards(page);
    }

    console.log(`LinkedIn notifications: detected ${cards.length} candidate job notification(s).`);
    return cards;
}

async function extractJobsFromJobsHome(page) {
    const clicked = await evaluateWithNavigationRetry(page, () => {
        const labels = ['show all', '\u043f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0432\u0441\u0435'];
        const nodes = Array.from(document.querySelectorAll('a, button, [role="button"]'));
        const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim().toLowerCase();
        for (const node of nodes) {
            const text = textOf(node);
            if (labels.some((label) => text.includes(label))) {
                node.click();
                return text;
            }
        }
        return '';
    }).catch(() => '');

    if (clicked) {
        console.log(`LinkedIn jobs home: clicked CTA ${clicked}`);
        await sleep(2500);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
    }

    const rawAnchors = await evaluateWithNavigationRetry(page, () => {
        const textOfNode = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim();
        const seen = new Set();
        const results = [];
        const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
        anchors.forEach((anchor) => {
            const href = (anchor.href || '').trim();
            if (!href || seen.has(href)) return;
            seen.add(href);

            const paragraphs = Array.from(anchor.querySelectorAll('p')).map(textOfNode).filter(Boolean);
            const company = paragraphs[1] || '';
            const maybeLocation = paragraphs[3] || paragraphs[2] || '';
            const location = maybeLocation === '?' ? '' : maybeLocation;

            results.push({
                href,
                text: textOfNode(anchor),
                title: paragraphs[0] || '',
                company,
                location,
            });
        });
        return results;
    });

    const results = [];
    const seen = new Set();
    for (const entry of rawAnchors) {
        const parsedCollection = parseLinkedinJobsHomeCollectionLink(entry);
        if (parsedCollection) {
            if (!seen.has(parsedCollection.id)) {
                seen.add(parsedCollection.id);
                results.push({
                    ...parsedCollection,
                    rating: null,
                    easyApply: false,
                    posted: '',
                    source: 'linkedin',
                });
            }
            continue;
        }

        const normalizedAnchor = normalizeLinkedinJobsHomeAnchor(entry);
        if (!normalizedAnchor) continue;
        if (seen.has(normalizedAnchor.id)) continue;
        seen.add(normalizedAnchor.id);
        results.push({
            ...normalizedAnchor,
            rating: null,
            easyApply: false,
            posted: '',
            source: 'linkedin',
        });
    }

    return results.filter((job) => isValidLinkedInVacancy(job));
}

async function resolveNotificationTarget(context, selectors, notification) {
    const targetPage = await context.newPage();
    try {
        console.log(`Resolving LinkedIn notification target (${notification.targetType}): ${notification.href}`);
        await targetPage.goto(notification.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(2500);

        if (notification.targetType === 'job_view') {
            const job = await extractJobFromViewPage(targetPage);
            if (job) {
                if (!job.posted && notification.linkedinNotificationContext && notification.linkedinNotificationContext.posted) {
                    job.posted = notification.linkedinNotificationContext.posted;
                }
                console.log(`LinkedIn notification resolved direct job: ${job.id}`);
                return [applyLinkedinNotificationSignal(job, notification)];
            }

            const fallbackJobs = await extractJobsWithRetry(targetPage, selectors, 1);
            if (fallbackJobs.length > 0) {
                console.log(`LinkedIn notification fallback from job_view captured ${fallbackJobs.length} job card(s).`);
                return fallbackJobs.map((entry) => applyLinkedinNotificationSignal(entry, notification));
            }

            console.warn(`LinkedIn notification direct target produced no job payload: ${notification.href}`);
            return [];
        }

        if (notification.targetType === 'job_home') {
            const homeJobs = await extractJobsFromJobsHome(targetPage);
            if (homeJobs.length > 0) {
                console.log(`LinkedIn notification jobs home captured ${homeJobs.length} recommended job(s).`);
                return homeJobs.map((job) => applyLinkedinNotificationSignal(job, notification));
            }
        }

        const jobs = await extractJobsWithRetry(targetPage, selectors, 3);
        if (jobs.length > 0) {
            console.log(`LinkedIn notification list target captured ${jobs.length} job card(s).`);
            return jobs.map((job) => applyLinkedinNotificationSignal(job, notification));
        }

        const fallbackJob = await extractJobFromViewPage(targetPage);
        if (fallbackJob) {
            if (!fallbackJob.posted && notification.linkedinNotificationContext && notification.linkedinNotificationContext.posted) {
                fallbackJob.posted = notification.linkedinNotificationContext.posted;
            }
            console.log(`LinkedIn notification list target fell back to direct job: ${fallbackJob.id}`);
            return [applyLinkedinNotificationSignal(fallbackJob, notification)];
        }

        console.warn(`LinkedIn notification target produced no vacancies: ${notification.href}`);
        return [];
    } catch (error) {
        console.warn(`Failed to resolve LinkedIn notification target ${notification.href}: ${error.message}`);
        return [];
    } finally {
        await targetPage.close().catch(() => { });
    }
}

module.exports = {
    isValidLinkedInVacancy,
    extractNotificationCards,
    openNotificationJobsTab,
    extractJobsFromJobsHome,
    resolveNotificationTarget
};
