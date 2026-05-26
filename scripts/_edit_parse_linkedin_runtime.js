const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'scripts', 'parse_linkedin.js');
let source = fs.readFileSync(filePath, 'utf8');

function replaceBlock(startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`End marker not found: ${endMarker}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceBlock(
  'async function openNotificationJobsTab(page) {',
  'async function resolveNotificationTarget(context, selectors, notification) {',
  [
    "async function openNotificationJobsTab(page) {",
    "    console.log('Opening LinkedIn notifications...');",
    "    await page.goto('https://www.linkedin.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 60000 });",
    "    await sleep(2500);",
    "    await dismissBlockingUi(page);",
    "",
    "    const clicked = await evaluateWithNavigationRetry(page, () => {",
    "        const labels = ['jobs', '\\u0432\\u0430\\u043a\\u0430\\u043d\\u0441\\u0438\\u0438', 'empregos'];",
    "        const nodes = Array.from(document.querySelectorAll('a, button, [role=\"tab\"]'));",
    "        const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\\s+/g, ' ').trim().toLowerCase();",
    "        for (const node of nodes) {",
    "            const combined = `${textOf(node)} ${(node.getAttribute && node.getAttribute('href') || '').toLowerCase()}`;",
    "            if (labels.some((label) => combined.includes(label))) {",
    "                node.click();",
    "                return true;",
    "            }",
    "        }",
    "        return false;",
    "    }).catch(() => false);",
    "",
    "    if (clicked) {",
    "        console.log('LinkedIn notifications: jobs tab selected.');",
    "        await sleep(2500);",
    "        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });",
    "    }",
    "",
    "    let cards = await extractNotificationCards(page);",
    "    if (cards.length === 0) {",
    "        console.log('LinkedIn notifications: no job cards after tab click, trying direct jobs filter url...');",
    "        await page.goto('https://www.linkedin.com/notifications/?filter=jobs', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => { });",
    "        await sleep(2500);",
    "        cards = await extractNotificationCards(page);",
    "    }",
    "",
    "    console.log(`LinkedIn notifications: detected ${cards.length} candidate job notification(s).`);",
    "    return cards;",
    "}",
    "",
  ].join('\n')
);

replaceBlock(
  'async function resolveNotificationTarget(context, selectors, notification) {',
  'async function enrichVacanciesWithDetails(context, jobs, options) {',
  [
    "async function resolveNotificationTarget(context, selectors, notification) {",
    "    const targetPage = await context.newPage();",
    "    try {",
    "        console.log(`Resolving LinkedIn notification target (${notification.targetType}): ${notification.href}`);",
    "        await targetPage.goto(notification.href, { waitUntil: 'domcontentloaded', timeout: 60000 });",
    "        await sleep(2500);",
    "",
    "        if (notification.targetType === 'job_view') {",
    "            const job = await extractJobFromViewPage(targetPage);",
    "            if (job) {",
    "                if (!job.posted && notification.linkedinNotificationContext && notification.linkedinNotificationContext.posted) {",
    "                    job.posted = notification.linkedinNotificationContext.posted;",
    "                }",
    "                console.log(`LinkedIn notification resolved direct job: ${job.id}`);",
    "                return [applyLinkedinNotificationSignal(job, notification)];",
    "            }",
    "",
    "            const fallbackJobs = await extractJobsWithRetry(targetPage, selectors, 1);",
    "            if (fallbackJobs.length > 0) {",
    "                console.log(`LinkedIn notification fallback from job_view captured ${fallbackJobs.length} job card(s).`);",
    "                return fallbackJobs.map((entry) => applyLinkedinNotificationSignal(entry, notification));",
    "            }",
    "",
    "            console.warn(`LinkedIn notification direct target produced no job payload: ${notification.href}`);",
    "            return [];",
    "        }",
    "",
    "        const jobs = await extractJobsWithRetry(targetPage, selectors, 3);",
    "        if (jobs.length > 0) {",
    "            console.log(`LinkedIn notification list target captured ${jobs.length} job card(s).`);",
    "            return jobs.map((job) => applyLinkedinNotificationSignal(job, notification));",
    "        }",
    "",
    "        const fallbackJob = await extractJobFromViewPage(targetPage);",
    "        if (fallbackJob) {",
    "            if (!fallbackJob.posted && notification.linkedinNotificationContext && notification.linkedinNotificationContext.posted) {",
    "                fallbackJob.posted = notification.linkedinNotificationContext.posted;",
    "            }",
    "            console.log(`LinkedIn notification list target fell back to direct job: ${fallbackJob.id}`);",
    "            return [applyLinkedinNotificationSignal(fallbackJob, notification)];",
    "        }",
    "",
    "        console.warn(`LinkedIn notification target produced no vacancies: ${notification.href}`);",
    "        return [];",
    "    } catch (error) {",
    "        console.warn(`Failed to resolve LinkedIn notification target ${notification.href}: ${error.message}`);",
    "        return [];",
    "    } finally {",
    "        await targetPage.close().catch(() => { });",
    "    }",
    "}",
    "",
  ].join('\n') + 'async function enrichVacanciesWithDetails(context, jobs, options) {'
);

source = source.replace(
  "            const notifications = await openNotificationJobsTab(page);",
  "            console.log('Starting LinkedIn notifications pass...');\n            const notifications = await openNotificationJobsTab(page);"
);

fs.writeFileSync(filePath, source);
