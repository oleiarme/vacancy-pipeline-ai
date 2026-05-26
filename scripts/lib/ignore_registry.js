const fs = require('fs');
const path = require('path');
const { normalizeText } = require('./text_utils');

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'data', 'ignored_vacancies.json');

function normalizeLink(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        return `${parsed.host}${parsed.pathname}${parsed.search}`.replace(/\/$/, '').toLowerCase();
    } catch {
        return normalizeText(raw);
    }
}

function readRegistryFile(registryPath = DEFAULT_REGISTRY_PATH) {
    if (!fs.existsSync(registryPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function writeRegistryFile(registryPath, registry) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

function buildRegistryKey(entry) {
    if (entry && entry.id) return `id:${entry.id}`;
    const link = normalizeLink(entry && entry.link);
    if (link) return `link:${link}`;
    return '';
}

function loadIgnoreRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
    return readRegistryFile(registryPath);
}

function addIgnoredVacancy(registryPath = DEFAULT_REGISTRY_PATH, vacancy = {}) {
    const registry = readRegistryFile(registryPath);
    const key = buildRegistryKey(vacancy);
    if (!key) throw new Error('Ignored vacancy requires id or link');

    const entry = {
        id: vacancy.id || '',
        link: String(vacancy.link || '').trim(),
        normalized_link: normalizeLink(vacancy.link),
        title: String(vacancy.title || '').trim(),
        company: String(vacancy.company || '').trim(),
        source: String(vacancy.source || 'telegram').trim(),
        ignored_at: vacancy.ignored_at || new Date().toISOString(),
    };

    registry[key] = entry;
    if (entry.normalized_link) {
        registry[`link:${entry.normalized_link}`] = entry;
    }

    writeRegistryFile(registryPath, registry);
    return entry;
}

function findIgnoredVacancy(vacancy = {}, registryPath = DEFAULT_REGISTRY_PATH) {
    const registry = readRegistryFile(registryPath);
    const idKey = vacancy && vacancy.id ? `id:${vacancy.id}` : '';
    if (idKey && registry[idKey]) return registry[idKey];

    const normalized = normalizeLink(vacancy && vacancy.link);
    const linkKey = normalized ? `link:${normalized}` : '';
    if (linkKey && registry[linkKey]) return registry[linkKey];

    return null;
}

function filterIgnoredVacancies(vacancies, registryPath = DEFAULT_REGISTRY_PATH) {
    const rows = Array.isArray(vacancies) ? vacancies : [];
    return rows.filter((vacancy) => !findIgnoredVacancy(vacancy, registryPath));
}

module.exports = {
    DEFAULT_REGISTRY_PATH,
    addIgnoredVacancy,
    buildRegistryKey,
    filterIgnoredVacancies,
    findIgnoredVacancy,
    loadIgnoreRegistry,
    normalizeLink,
    normalizeText,
};
