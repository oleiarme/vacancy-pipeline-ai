const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./lib/config');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const state = JSON.parse(fs.readFileSync(config.LINKEDIN_STATE_PATH, 'utf8'));
    const validStorageState = state && Array.isArray(state.cookies) && Array.isArray(state.origins);
    if (!validStorageState) {
        throw new Error(`Invalid auth file at ${config.LINKEDIN_STATE_PATH}. Recreate via: npm run auth:linkedin`);
    }
    const context = await browser.newContext({ storageState: config.LINKEDIN_STATE_PATH });
    const page = await context.newPage();
    await page.goto("https://www.linkedin.com/jobs/search/?keywords=DevOps%20Engineer&location=Portugal&f_TPR=r604800", { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // 5 sec
    const html = await page.content();
    fs.writeFileSync('li_html.html', html);
    await page.screenshot({ path: 'li_screenshot.png' });
    await browser.close();
})();
