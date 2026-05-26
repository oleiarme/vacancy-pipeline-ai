
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const ROOT = path.resolve(__dirname, '..');
  const profileDir = path.join(ROOT, 'auth', 'linkedin_profile');
  const reportsDir = path.join(ROOT, 'reports');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] || await context.newPage();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(reportsDir, 'linkedin_jobs_home_after_show_all_' + stamp + '.png');
  const linksPath = path.join(reportsDir, 'linkedin_jobs_home_after_show_all_' + stamp + '_links.json');
  const htmlPath = path.join(reportsDir, 'linkedin_jobs_home_after_show_all_' + stamp + '.html');

  try {
    console.log('Opening LinkedIn jobs home with parser profile...');
    await page.goto('https://www.linkedin.com/jobs/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);

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

    console.log('Clicked CTA:', clicked || '(none)');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);

    const snapshot = await page.evaluate(() => {
      const textOf = (node) => ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim();
      const anchors = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        text: textOf(a),
        href: a.href || a.getAttribute('href') || '',
      }));
      const jobishAnchors = anchors.filter((a) => /jobs/i.test(a.href) || /jobs/i.test(a.text));
      const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((n) => textOf(n)).filter(Boolean);
      return {
        url: window.location.href,
        title: document.title,
        headings,
        anchorsCount: anchors.length,
        jobishAnchors: jobishAnchors.slice(0, 200),
        bodySnippet: textOf(document.body).slice(0, 5000),
        html: document.documentElement.outerHTML,
      };
    });

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    fs.writeFileSync(linksPath, JSON.stringify({
      url: snapshot.url,
      title: snapshot.title,
      headings: snapshot.headings,
      anchorsCount: snapshot.anchorsCount,
      jobishAnchors: snapshot.jobishAnchors,
      bodySnippet: snapshot.bodySnippet,
      screenshotPath,
    }, null, 2));
    fs.writeFileSync(htmlPath, snapshot.html);

    console.log('Saved screenshot:', screenshotPath);
    console.log('Saved links json:', linksPath);
    console.log('Saved html:', htmlPath);
    console.log('Final URL:', snapshot.url);
    console.log('Headings:', JSON.stringify(snapshot.headings.slice(0, 20), null, 2));
    console.log('Jobish anchors sample:', JSON.stringify(snapshot.jobishAnchors.slice(0, 40), null, 2));
  } finally {
    await context.close().catch(() => {});
  }
})();
