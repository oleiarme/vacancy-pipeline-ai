const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');
const config = require('./lib/config');

function waitForEnter(promptText) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(promptText, () => {
            rl.close();
            resolve();
        });
    });
}

(async () => {
    const profileDir = config.LINKEDIN_PROFILE_DIR;
    const context = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'],
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log(`Opened LinkedIn login with persistent profile: ${profileDir}`);
    console.log('Sign in manually (and complete 2FA if needed).');
    await waitForEnter('After successful login press Enter to save profile and close browser...');
    await context.close();
    console.log('Profile saved. You can now run: node scripts/parse_linkedin.js');
})().catch((error) => {
    console.error('auth_linkedin_profile failed:', error.message);
    process.exitCode = 1;
});
