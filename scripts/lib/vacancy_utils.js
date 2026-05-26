const crypto = require('crypto');

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${pairs.join(',')}}`;
}

function getVacancyDedupKey(vacancy) {
    const titleKey = normalizeText(vacancy && vacancy.title);
    const companyKey = normalizeText(vacancy && vacancy.company);

    if (titleKey && companyKey) {
        return `tc_${titleKey}_${companyKey}`;
    }

    if (vacancy && vacancy.id) {
        return `id_${String(vacancy.id)}`;
    }

    if (vacancy && vacancy.link) {
        return `link_${String(vacancy.link).toLowerCase()}`;
    }

    // Deterministic fallback key keeps dedup idempotent between runs.
    const serialized = stableStringify(vacancy || {});
    const digest = crypto.createHash('sha1').update(serialized).digest('hex').slice(0, 16);
    return `fallback_${digest}`;
}

function normalizePosted(value) {
    if (typeof value === 'string') return value.trim();
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function parsePostedAge(postedValue) {
    const posted = normalizePosted(postedValue).toLowerCase();
    if (!posted) {
        return { isUrgent: false, unit: null, value: null, raw: '' };
    }

    if (/(just\s*posted|today|right\s*now|few\s+minutes|moments?\s+ago|new\s+today|<\s*1\s*d|сегодня|только что)/i.test(posted)) {
        return { isUrgent: true, unit: 'm', value: 0, raw: posted };
    }
    if (/(yesterday|вчера)/i.test(posted)) {
        return { isUrgent: true, unit: 'h', value: 24, raw: posted };
    }

    const absoluteMs = Date.parse(posted);
    if (Number.isFinite(absoluteMs)) {
        const deltaHours = (Date.now() - absoluteMs) / (1000 * 60 * 60);
        if (Number.isFinite(deltaHours) && deltaHours >= 0) {
            return {
                isUrgent: deltaHours <= 24 * 5,
                unit: 'h',
                value: deltaHours,
                raw: posted,
            };
        }
    }

    let match = posted.match(/(\d+(?:\.\d+)?)\s*(month|months|mo|месяц\S*)/i);
    if (match) {
        const months = Number.parseFloat(match[1]);
        return { isUrgent: false, unit: 'mo', value: months, raw: posted };
    }

    match = posted.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|m|минут\S*)/i);
    if (match) {
        const minutes = Number.parseFloat(match[1]);
        return { isUrgent: Number.isFinite(minutes), unit: 'm', value: minutes, raw: posted };
    }

    match = posted.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|час\S*)/i);
    if (match) {
        const hours = Number.parseFloat(match[1]);
        return { isUrgent: Number.isFinite(hours), unit: 'h', value: hours, raw: posted };
    }

    match = posted.match(/(\d+(?:\.\d+)?)\s*(d|day|days|дн\S*|день|дня)/i);
    if (match) {
        const days = Number.parseFloat(match[1]);
        return { isUrgent: Number.isFinite(days) && days <= 5, unit: 'd', value: days, raw: posted };
    }

    match = posted.match(/(\d+(?:\.\d+)?)\s*(w|week|weeks|недел\S*)/i);
    if (match) {
        const weeks = Number.parseFloat(match[1]);
        return { isUrgent: false, unit: 'w', value: weeks, raw: posted };
    }

    match = posted.match(/\b(\d+(?:\.\d+)?)([hdwm])\b/i);
    if (match) {
        const value = Number.parseFloat(match[1]);
        const unit = String(match[2]).toLowerCase();
        if (!Number.isFinite(value)) {
            return { isUrgent: false, unit: null, value: null, raw: posted };
        }
        if (unit === 'h') return { isUrgent: true, unit: 'h', value, raw: posted };
        if (unit === 'd') return { isUrgent: value <= 5, unit: 'd', value, raw: posted };
        if (unit === 'w') return { isUrgent: false, unit: 'w', value, raw: posted };
        if (unit === 'm') return { isUrgent: false, unit: 'mo', value, raw: posted };
    }

    return { isUrgent: false, unit: null, value: null, raw: posted };
}

function getPostedDays(postedValue) {
    const parsed = parsePostedAge(postedValue);
    if (!parsed || !Number.isFinite(parsed.value)) return null;
    if (parsed.unit === 'm') return 0;
    if (parsed.unit === 'd') return parsed.value;
    if (parsed.unit === 'h') return Math.ceil(parsed.value / 24);
    if (parsed.unit === 'w') return Math.ceil(parsed.value * 7);
    if (parsed.unit === 'mo') return Math.ceil(parsed.value * 30);
    return null;
}

function parseReasonsFromReasoning(reasoning) {
    if (!reasoning || typeof reasoning !== 'string') return [];
    return reasoning
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeGeoText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasPortugalSignal(value) {
    const text = normalizeGeoText(value);
    if (!text) return false;

    const portugalPattern = /(?:\bportugal\b|\bportuguese\b|\u043f\u043e\u0440\u0442\u0443\u0433\u0430\u043b)/i;
    if (portugalPattern.test(text)) return true;

    const portugalCityTokens = [
        'lisbon',
        'lisboa',
        'lissabon',
        'лиссабон',
        'porto',
        'порту',
        'braga',
        'coimbra',
        'aveiro',
        'faro',
        'setubal',
        'leiria',
        'oeiras',
        'cascais',
        'sintra',
        'guimaraes',
        'matosinhos',
        'maia',
        'amadora',
        'almada',
        'loures',
        'odivelas',
        'fatima',
        'nazare',
        'peniche',
        'caldas da rainha',
        'obidos',
        'torres vedras',
        'santarem',
        'rio maior',
        'pombal',
        'seixal',
        'barreiro',
        'sesimbra',
        'costa da caparica',
        'mafra',
        'gondomar',
        'seixal',
        'barreiro',
        'vila nova de gaia',
        'viana do castelo',
        'vila real',
        'braganca',
        'castelo branco',
        'santarem',
        'portalegre',
        'beja',
        'evora',
        'viseu',
        'funchal',
        'ponta delgada',
        'madeira',
        'azores',
        'acores',
        'porto salvo'
    ];

    return portugalCityTokens.some((token) => text.includes(token));
}
function isPortugalVacancy(vacancy) {
    if (!vacancy || typeof vacancy !== 'object') return false;

    if (hasPortugalSignal(vacancy.location)) return true;

    // Fallback for records without structured location (e.g. email extraction).
    const context = [vacancy.title, vacancy.description, vacancy.link].filter(Boolean).join(' ');
    return hasPortugalSignal(context);
}

module.exports = {
    getVacancyDedupKey,
    normalizePosted,
    parsePostedAge,
    getPostedDays,
    parseReasonsFromReasoning,
    hasPortugalSignal,
    isPortugalVacancy,
};
