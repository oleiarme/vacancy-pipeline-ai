const fs = require('fs');
const path = require('path');
const appConfig = require('./config');
const { buildLocationSignals, textHasSignal, vacancyMatchesSignals } = require('./location_policy');

const ROOT = appConfig.ROOT;
const ENV_PATH = appConfig.ENV_PATH;
const ALLOWED_TIME_WINDOWS = new Set(['today', '1d', '3d', 'all']);

function getArgValue(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1) return '';
    return String(process.argv[index + 1] || '').trim();
}

function readJson(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} missing: ${path.relative(ROOT, filePath)}`);
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new Error(`${label} invalid JSON: ${error.message}`);
    }
}

function toArray(value, label) {
    if (!Array.isArray(value)) {
        throw new Error(`${label} is not an array`);
    }
    return value;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function runCheck(name, fn, checks) {
    try {
        fn();
        console.log(`PASS: ${name}`);
        checks.push({ name, ok: true, error: '' });
        return true;
    } catch (error) {
        console.error(`FAIL: ${name}`);
        console.error(`  ${error.message}`);
        checks.push({ name, ok: false, error: error.message });
        return false;
    }
}

function validateUrlsContainSignals(portalName, urls, locationSignals) {
    const bad = urls.filter((url) => !textHasSignal(url, locationSignals));
    assert(bad.length === 0, `${portalName} has searchUrls outside active location profile: ${bad.join(', ')}`);
}

function validateLocationPolicy(label, vacancies, locationSignals) {
    const outOfPolicy = vacancies.filter((v) => !vacancyMatchesSignals(v, locationSignals));
    assert(outOfPolicy.length === 0, `${label} has ${outOfPolicy.length} vacancies outside active location profile`);
}

function validateLinks(label, vacancies) {
    const invalid = vacancies.filter((v) => {
        const link = String(v && v.link ? v.link : '').trim();
        return !/^https?:\/\/\S+$/i.test(link);
    });
    assert(invalid.length === 0, `${label} has ${invalid.length} invalid links`);
}

function validateNoDuplicateIds(vacancies) {
    const seen = new Set();
    const dupes = [];
    vacancies.forEach((v) => {
        const id = String(v && v.id ? v.id : '').trim();
        if (!id) return;
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
    });
    assert(dupes.length === 0, `Duplicate IDs found (${dupes.length})`);
}

function writeJsonOut(outPath, payload) {
    if (!outPath) return;
    const abs = path.isAbsolute(outPath) ? outPath : path.join(ROOT, outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(payload, null, 2));
}

function loadEnvValues() {
    return appConfig.env;
}

function buildLocationContext() {
    const config = readJson(path.join(ROOT, 'config', 'search_config.json'), 'search_config.json');
    const locationSignals = buildLocationSignals(config);
    return { config, locationSignals };
}

module.exports = {
    ROOT,
    ENV_PATH,
    ALLOWED_TIME_WINDOWS,
    getArgValue,
    readJson,
    toArray,
    assert,
    runCheck,
    validateUrlsContainSignals,
    validateLocationPolicy,
    validateLinks,
    validateNoDuplicateIds,
    writeJsonOut,
    loadEnvValues,
    buildLocationContext,
};
