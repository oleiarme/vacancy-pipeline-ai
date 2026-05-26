const path = require('path');
const {
    getArgValue,
    runCheck,
    writeJsonOut,
    loadEnvValues,
    ALLOWED_TIME_WINDOWS,
    buildLocationContext,
    validateUrlsContainSignals,
    toArray,
    assert,
} = require('./lib/verify_common');

function runStaticChecks(options = {}) {
    const checks = [];
    let failures = 0;
    const startedAt = new Date().toISOString();
    const jsonOutPath = options.jsonOutPath !== undefined ? options.jsonOutPath : getArgValue('--json-out');
    const exitOnFailure = options.exitOnFailure !== undefined ? options.exitOnFailure : true;

    const envValues = loadEnvValues();
    const timeWindow = String(process.env.GMAIL_GLASSDOOR_TIME_WINDOW || envValues.GMAIL_GLASSDOOR_TIME_WINDOW || '').trim().toLowerCase();

    if (!runCheck('Gmail time window is configured', () => {
        assert(timeWindow, 'GMAIL_GLASSDOOR_TIME_WINDOW is empty');
        assert(ALLOWED_TIME_WINDOWS.has(timeWindow), `Unsupported GMAIL_GLASSDOOR_TIME_WINDOW="${timeWindow}"`);
    }, checks)) failures += 1;

    let config;
    let locationSignals;
    if (!runCheck('search_config has active location profile', () => {
        const context = buildLocationContext();
        config = context.config;
        locationSignals = context.locationSignals;
        assert(locationSignals.length > 0, 'config.filters.locations is empty');
    }, checks)) failures += 1;

    if (!runCheck('search_config URLs match active location profile', () => {
        if (!config) {
            const context = buildLocationContext();
            config = context.config;
            locationSignals = context.locationSignals;
        }
        const portals = toArray(config.portals, 'config.portals');
        const gd = portals.find((p) => p && p.name === 'glassdoor');
        const li = portals.find((p) => p && p.name === 'linkedin');
        assert(gd, 'Missing portal: glassdoor');
        assert(li, 'Missing portal: linkedin');
        validateUrlsContainSignals('glassdoor', toArray(gd.searchUrls, 'glassdoor.searchUrls'), locationSignals);
        validateUrlsContainSignals('linkedin', toArray(li.searchUrls, 'linkedin.searchUrls'), locationSignals);
    }, checks)) failures += 1;

    const summary = {
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: failures === 0,
        failures,
        checks,
    };

    writeJsonOut(jsonOutPath, summary);

    if (!summary.ok) {
        console.error(`\nStatic verification failed: ${summary.failures} check(s).`);
        if (exitOnFailure) {
            process.exitCode = 1;
        }
        return summary;
    }

    console.log('\nStatic verification passed: all checks are green.');
    return summary;
}

if (require.main === module) {
    runStaticChecks();
}

module.exports = { runStaticChecks };
