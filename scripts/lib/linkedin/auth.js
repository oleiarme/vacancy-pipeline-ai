/**
 * auth.js - handles LinkedIn authentication wall detection and context creation.
 */

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

module.exports = {
    isAuthWall
};
