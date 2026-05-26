
const { chromium } = require('playwright');
const path = require('path');
const { parseLinkedinJobsHomeCollectionLink } = require('./lib/linkedin_jobs_home');

(async () => {
  const ROOT = path.resolve(__dirname, '..');
  const profileDir = path.join(ROOT, 'auth', 'linkedin_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    console.log('Opening LinkedIn jobs home with parser profile...');
    await page.goto('https://www.linkedin.com/jobs/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const clicked = await page.evaluate(() => {
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
      console.log('Clicked jobs-home CTA:', clicked);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }

    const rawAnchors = await page.evaluate(() => {
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

    const parsed = rawAnchors.map((entry) => parseLinkedinJobsHomeCollectionLink(entry)).filter(Boolean);
    console.log('Parsed jobs-home collection vacancies:', parsed.length);
    console.log(JSON.stringify(parsed.slice(0, 20), null, 2));
  } finally {
    await context.close().catch(() => {});
  }
})();
