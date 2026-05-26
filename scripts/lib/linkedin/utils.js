/**
 * utils.js - common Playwright DOM and navigation helpers for LinkedIn.
 */

function isExecutionContextDestroyedError(error) {
    return /Execution context was destroyed|Cannot find context with specified id|Most likely the page has been closed/i.test(
        String(error && error.message ? error.message : error)
    );
}

function randomDelayMs(minMs, maxMs) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluateWithNavigationRetry(page, fn, arg, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await page.evaluate(fn, arg);
        } catch (error) {
            lastError = error;
            if (!isExecutionContextDestroyedError(error) || attempt === retries) {
                throw error;
            }
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => { });
            await sleep(800);
        }
    }
    throw lastError;
}

async function dismissBlockingUi(page) {
    const dismissSelectors = [
        'button[aria-label*="Dismiss"]',
        'button[aria-label*="Close"]',
        'button[aria-label*="Закрыть"]',
        'button[aria-label*="Отклонить"]',
        'button[data-test-modal-close-btn]',
    ];
    for (const selector of dismissSelectors) {
        const btn = page.locator(selector).first();
        const visible = await btn.isVisible({ timeout: 400 }).catch(() => false);
        if (visible) {
            await btn.click({ timeout: 1000 }).catch(() => { });
            await sleep(300);
        }
    }
}

module.exports = {
    randomDelayMs,
    sleep,
    evaluateWithNavigationRetry,
    dismissBlockingUi
};
