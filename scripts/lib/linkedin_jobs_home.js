const { normalizeWhitespace } = require('./text_utils');

const normalizeText = normalizeWhitespace;

function extractCurrentJobId(href) {
    const raw = normalizeText(href);
    if (!raw) return null;
    try {
        const url = new URL(raw, 'https://www.linkedin.com');
        const currentJobId = url.searchParams.get('currentJobId');
        return currentJobId && /^\d+$/.test(currentJobId) ? currentJobId : null;
    } catch (_) {
        const match = raw.match(/[?&]currentJobId=(\d+)/i);
        return match ? match[1] : null;
    }
}

function cleanRecommendationTitle(value) {
    let title = normalizeText(value);
    const markers = ['(verified)', '(\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u0430\u044f \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044f)'];
    markers.forEach((marker) => {
        title = title.split(marker).join(' ');
    });
    title = normalizeText(title);

    const tokens = title.split(/\s+/).filter(Boolean);
    for (let size = Math.floor(tokens.length / 2); size >= 1; size -= 1) {
        const first = tokens.slice(0, size).join(' ');
        const second = tokens.slice(size, size * 2).join(' ');
        const rest = tokens.slice(size * 2).join(' ').trim();
        if (first && first === second && !rest) {
            return first;
        }
    }

    return title;
}

function splitTitleAndCompany(text) {
    const normalized = normalizeText(text);
    const parts = normalized.split(/\s+-\s+/);
    const left = normalizeText(parts[0]);
    const location = parts.length > 1 ? normalizeText(parts.slice(1).join(' - ')) : null;
    const tokens = left.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;

    for (let size = Math.floor(tokens.length / 2); size >= 1; size -= 1) {
        const first = tokens.slice(0, size).join(' ');
        const second = tokens.slice(size, size * 2).join(' ');
        if (first && first === second) {
            const company = tokens.slice(size * 2).join(' ').trim();
            if (company) {
                return { title: first, company, location };
            }
        }
    }

    let companyStart = Math.max(1, tokens.length - 1);
    for (let i = 1; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (/^[A-Z][A-Za-z0-9&._-]+$/.test(token) || /[A-Z][a-z]+[A-Z][a-z]+/.test(token)) {
            companyStart = i;
            break;
        }
    }

    const titleTokens = tokens.slice(0, companyStart);
    const companyTokens = tokens.slice(companyStart);
    if (titleTokens.length === 0 || companyTokens.length === 0) return null;

    return {
        title: titleTokens.join(' ').trim(),
        company: companyTokens.join(' ').trim(),
        location,
    };
}

function parseLinkedinJobsHomeCollectionLink(entry) {
    const href = normalizeText(entry && entry.href);
    if (!/linkedin\.com\/jobs\/collections\/recommended\//i.test(href)) return null;

    const currentJobId = extractCurrentJobId(href);
    if (!currentJobId) return null;

    const directTitle = cleanRecommendationTitle(entry && entry.title);
    const directCompany = normalizeText(entry && entry.company);
    const directLocation = normalizeText(entry && entry.location) || null;
    if (directTitle && directCompany) {
        return {
            id: `li_${currentJobId}`,
            title: directTitle,
            company: directCompany,
            location: directLocation,
            link: `https://www.linkedin.com/jobs/view/${currentJobId}/`,
        };
    }

    const text = normalizeText(entry && entry.text);
    const cleanedText = text
        .replace(/\(verified\)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const parsed = splitTitleAndCompany(cleanedText);
    if (!parsed) return null;

    return {
        id: `li_${currentJobId}`,
        title: cleanRecommendationTitle(parsed.title),
        company: parsed.company,
        location: parsed.location,
        link: `https://www.linkedin.com/jobs/view/${currentJobId}/`,
    };
}

const UNKNOWN_COMPANY = 'Unknown Company';

function extractLinkedinJobIdFromHref(href) {
    if (!href) return null;
    const normalized = normalizeText(href);
    try {
        const url = new URL(normalized, 'https://www.linkedin.com');
        const match = url.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?/i);
        if (match) return match[1];
        const currentJobId = url.searchParams.get('currentJobId');
        if (currentJobId && /^\d+$/.test(currentJobId)) return currentJobId;
    } catch (error) {
        const match = normalized.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?/i);
        if (match) return match[1];
        const simpleMatch = normalized.match(/[?&]currentJobId=(\d+)/i);
        if (simpleMatch) return simpleMatch[1];
    }
    return null;
}

function canonicalizeJobsHomeLink(href, jobId) {
    if (!jobId) return null;
    if (!href) {
        return `https://www.linkedin.com/jobs/view/${jobId}/`;
    }
    try {
        const url = new URL(href, 'https://www.linkedin.com');
        url.pathname = `/jobs/view/${jobId}/`;
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return `https://www.linkedin.com/jobs/view/${jobId}/`;
    }
}

function buildAnchorTitle(entry) {
    const rawTitle = normalizeText(entry && entry.title ? entry.title : entry && entry.text ? entry.text : '');
    if (!rawTitle) return null;
    const parsed = splitTitleAndCompany(rawTitle);
    const hasExplicitTitle = Boolean(entry && entry.title && entry.title.trim());
    let titleCandidate = rawTitle;
    if (!hasExplicitTitle) {
        const hyphenParts = rawTitle.split(/\s*-\s*/);
        const companySegment = entry && entry.company ? normalizeText(entry.company) : null;
        if (
            hyphenParts.length > 1 &&
            companySegment &&
            normalizeText(hyphenParts[hyphenParts.length - 1]) === companySegment
        ) {
            titleCandidate = hyphenParts.slice(0, -1).join(' - ');
        } else if (parsed && parsed.title) {
            titleCandidate = parsed.title;
        }
    }
    const normalizedTitle = cleanRecommendationTitle(titleCandidate);
    const company = entry && entry.company
        ? normalizeText(entry.company)
        : parsed && parsed.company
            ? parsed.company
            : UNKNOWN_COMPANY;
    const location = entry && entry.location
        ? normalizeText(entry.location)
        : parsed && parsed.location
            ? parsed.location
            : null;
    return { title: normalizedTitle, company, location };
}

function normalizeLinkedinJobsHomeAnchor(entry) {
    if (!entry) return null;
    const href = String(entry.href || '').split('?')[0];
    const jobId = extractLinkedinJobIdFromHref(href);
    if (!jobId) return null;
    const link = canonicalizeJobsHomeLink(href, jobId);
    const anchorTitle = buildAnchorTitle(entry);
    if (!anchorTitle) return null;
    return {
        id: `li_${jobId}`,
        link,
        ...anchorTitle,
    };
}

module.exports = {
    parseLinkedinJobsHomeCollectionLink,
    normalizeLinkedinJobsHomeAnchor,
};
