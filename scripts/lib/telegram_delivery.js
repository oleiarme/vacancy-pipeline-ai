function extractRetryAfterSeconds(payload) {
    const text = String(payload || '');
    if (!text) return null;

    try {
        const parsed = JSON.parse(text);
        const value = parsed && parsed.parameters && parsed.parameters.retry_after;
        if (Number.isFinite(value)) return Number(value);
    } catch {
        // fall through to regex parse
    }

    const match = text.match(/retry after\s+(\d+)/i);
    return match ? Number.parseInt(match[1], 10) : null;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    extractRetryAfterSeconds,
    wait,
};
