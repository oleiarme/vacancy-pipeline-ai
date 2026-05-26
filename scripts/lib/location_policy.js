const { hasPortugalSignal } = require('./vacancy_utils');

function normalizeComparable(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\+/g, ' ')
        .replace(/%20/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeUriSafe(value) {
    try {
        return decodeURIComponent(String(value || ''));
    } catch (_) {
        return String(value || '');
    }
}

function buildLocationSignals(config) {
    const raw = config && config.filters && Array.isArray(config.filters.locations)
        ? config.filters.locations
        : [];
    const unique = new Set();

    raw.forEach((item) => {
        const normalized = normalizeComparable(item);
        if (normalized && normalized.length >= 2) unique.add(normalized);
    });

    return Array.from(unique);
}

function textHasSignal(text, signals) {
    const normalized = normalizeComparable(decodeUriSafe(text));
    if (!normalized) return false;
    return signals.some((signal) => normalized.includes(signal));
}

function signalsTargetPortugal(signals) {
    return Array.isArray(signals) && signals.some((signal) => hasPortugalSignal(signal));
}

function vacancyMatchesSignals(vacancy, signals) {
    if (!vacancy || typeof vacancy !== 'object') return false;

    const joined = [
        vacancy.location,
        vacancy.title,
        vacancy.description,
        vacancy.link,
    ].filter(Boolean).join(' ');

    if (textHasSignal(joined, signals)) return true;
    if (signalsTargetPortugal(signals) && hasPortugalSignal(joined)) return true;
    return false;
}

module.exports = {
    buildLocationSignals,
    decodeUriSafe,
    normalizeComparable,
    textHasSignal,
    vacancyMatchesSignals,
};
