/**
 * parse_gmail_glassdoor.js - parse Glassdoor jobs from Gmail via Gmail API.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const config = require('./lib/config');
const { normalizePosted, getPostedDays, isPortugalVacancy } = require('./lib/vacancy_utils');

const ROOT = config.ROOT;
const TOKEN_PATH = config.GMAIL_TOKEN_PATH;
const VACANCIES_PATH = path.join(ROOT, 'data', 'vacancies_mail_glassdoor.json');
const SEEN_IDS_PATH = path.join(ROOT, 'data', 'seen_ids.json');

const env = config.env;
const getCfg = (key, fallback = '') => {
    const runtime = process.env[key];
    if (runtime !== undefined && runtime !== null) {
        return String(runtime).trim();
    }
    const fileValue = env[key];
    if (fileValue !== undefined && fileValue !== null && String(fileValue).trim() !== '') {
        return String(fileValue).trim();
    }
    return String(fallback);
};

const CLIENT_ID = getCfg('GMAIL_CLIENT_ID', '');
const CLIENT_SECRET = getCfg('GMAIL_CLIENT_SECRET', '');
const LABEL_NAME = getCfg('GMAIL_GLASSDOOR_LABEL', 'glassdoor');
const QUERY = getCfg('GMAIL_GLASSDOOR_QUERY', '');
const MAX_EMAILS = Number.parseInt(getCfg('GMAIL_GLASSDOOR_MAX_EMAILS', '20'), 10);
const ONLY_UNREAD = getCfg('GMAIL_GLASSDOOR_ONLY_UNREAD', 'true').toLowerCase() === 'true';
const TIME_WINDOW = getCfg('GMAIL_GLASSDOOR_TIME_WINDOW', 'today').toLowerCase(); // 'today' | '1d' | '3d' | 'all'
const ENFORCE_TODAY_MAIL_ONLY = TIME_WINDOW === 'today';
const SUBJECT_INCLUDE_RAW = getCfg('GMAIL_GLASSDOOR_SUBJECT_INCLUDE', '');
const SUBJECT_EXCLUDE_RAW = getCfg('GMAIL_GLASSDOOR_SUBJECT_EXCLUDE', 'food service worker;job alert: food service worker');
const HYDRATE_DESCRIPTIONS = getCfg('GLASSDOOR_HYDRATE_DESCRIPTIONS', 'true').toLowerCase() === 'true';
const HYDRATE_SCOPE_RAW = getCfg('GLASSDOOR_HYDRATE_SCOPE', 'missing').toLowerCase();
const HYDRATE_SCOPE = ['missing', 'new', 'all'].includes(HYDRATE_SCOPE_RAW) ? HYDRATE_SCOPE_RAW : 'missing';
const MAX_POSTED_DAYS_RAW = Number.parseFloat(getCfg('GLASSDOOR_MAX_POSTED_DAYS', '1.1'));
const MAX_POSTED_DAYS = Number.isFinite(MAX_POSTED_DAYS_RAW) && MAX_POSTED_DAYS_RAW > 0 ? MAX_POSTED_DAYS_RAW : 1.1;
const MAX_POSTED_HOURS = MAX_POSTED_DAYS * 24;
const CHROME_PATH_CFG = getCfg('CHROME_PATH', '');
const CHROME_TIMEOUT_RAW = Number.parseInt(getCfg('GLASSDOOR_CHROME_TIMEOUT_MS', '90000'), 10);
const CHROME_TIMEOUT_MS = Number.isFinite(CHROME_TIMEOUT_RAW) && CHROME_TIMEOUT_RAW > 0 ? CHROME_TIMEOUT_RAW : 90000;
const HYDRATE_DELAY_MIN_MS = 2000;
const HYDRATE_DELAY_MAX_MS = 4000;
const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
const MESSAGE_INCLUDE = SUBJECT_INCLUDE_RAW
    .split(';')
    .map((s) => normalizeText(s).toLowerCase())
    .filter(Boolean);
const MESSAGE_EXCLUDE = SUBJECT_EXCLUDE_RAW
    .split(';')
    .map((s) => normalizeText(s).toLowerCase())
    .filter(Boolean);

function ensureEnv() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env');
    }
}

function readJsonArray(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function base64UrlDecode(input) {
    const safe = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = safe + '==='.slice((safe.length + 3) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function stableIdFromUrl(url) {
    return `gdm_${crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 16)}`;
}

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#160;/g, ' ');
}

function stripHtmlTags(html) {
    return String(html || '')
        // Insert newlines before/after block-level elements to preserve boundaries
        .replace(/<\/(td|tr|div|p|li|h[1-6]|table|section|article)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        // Remove all remaining HTML tags
        .replace(/<[^>]*>/g, ' ')
        // Decode HTML entities AFTER stripping tags
        .replace(/&nbsp;/g, '\n')
        .replace(/&#160;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        // Normalize whitespace on each line, then trim
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

function extractIdFromGlassdoorUrl(url) {
    try {
        const u = new URL(decodeHtmlEntities(url));
        const jobListingId = u.searchParams.get('jobListingId');
        if (jobListingId) return `gd_${jobListingId}`;
        const jl = u.searchParams.get('jl');
        if (jl) return `gd_${jl}`;
        return stableIdFromUrl(url);
    } catch (_) {
        return stableIdFromUrl(url);
    }
}

function parsePostedFromUtm(url) {
    try {
        const u = new URL(decodeHtmlEntities(url));
        const utmContent = u.searchParams.get('utm_content') || '';
        // Formats: ja-jobpos1-age6d-ID, ja-jobpos1-age23h-ID, ja-jobpos1-agept-ID, ja-jobpos1-agejp-ID
        const match = utmContent.match(/age(\d+(?:\.\d+)?[dhwm]|pt|jp)/i);
        if (!match) return '';
        const raw = String(match[1] || '').toLowerCase();
        if (raw === 'pt' || raw === 'jp') return '<1d';
        return raw; // e.g. '6d', '23h'
    } catch (_) {
        return '';
    }
}

function parsePostedFromText(text) {
    const source = String(text || '').toLowerCase();
    if (!source) return '';

    if (/(just\s*posted|today|right\s*now|few\s+minutes|moments?\s+ago|less\s+than\s+1\s+day|new\s+today)/i.test(source)) {
        return '<1d';
    }

    let match = source.match(/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/i);
    if (match) return `${match[1]}h`;

    match = source.match(/\b(\d+(?:\.\d+)?)\s*(d|day|days)\b/i);
    if (match) return `${match[1]}d`;

    match = source.match(/\b(\d+(?:\.\d+)?)\s*(w|week|weeks)\b/i);
    if (match) return `${match[1]}w`;

    match = source.match(/\b(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/i);
    if (match) return `${match[1]}m`;

    match = source.match(/\b(\d+(?:\.\d+)?)([hdwm])\b/i);
    if (match) return `${match[1]}${String(match[2]).toLowerCase()}`;

    return '';
}

function postedToHours(postedValue) {
    const posted = normalizePosted(postedValue).toLowerCase();
    if (!posted) return null;
    if (posted.includes('<1d') || /just\s*posted|today|right\s*now|few\s+minutes|moments?\s+ago/i.test(posted)) {
        return 0;
    }

    const match = posted.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)\b/i)
        || posted.match(/\b(\d+(?:\.\d+)?)([hdwm])\b/i);
    if (!match) return null;

    const value = Number.parseFloat(match[1]);
    const unitRaw = String(match[2] || '').toLowerCase();
    if (!Number.isFinite(value)) return null;

    if (unitRaw.startsWith('m')) return value / 60;
    if (unitRaw.startsWith('h')) return value;
    if (unitRaw.startsWith('d')) return value * 24;
    if (unitRaw.startsWith('w')) return value * 24 * 7;
    return null;
}

function isRecentVacancy(vacancy) {
    if (vacancy && vacancy.still_available_mail === true) return true;
    const hours = postedToHours(vacancy && vacancy.posted);
    if (!Number.isFinite(hours)) return false;
    return hours <= MAX_POSTED_HOURS;
}

function buildCanonicalLink(url) {
    try {
        const decoded = decodeHtmlEntities(url);
        const u = new URL(decoded);
        const jobListingId = u.searchParams.get('jobListingId') || u.searchParams.get('jl');
        if (jobListingId) {
            return `https://www.glassdoor.com/job-listing/j?jl=${jobListingId}`;
        }
        // If no jobListingId, at least return the decoded URL
        return decoded;
    } catch (_) {
        return decodeHtmlEntities(url);
    }
}

function decodeTrackedUrl(url) {
    try {
        const decoded = decodeHtmlEntities(url);
        const u = new URL(decoded);
        if (/google\./i.test(u.hostname) && u.pathname === '/url') {
            return u.searchParams.get('q') || u.searchParams.get('url') || decoded;
        }
        if (/glassdoor\./i.test(u.hostname)) {
            return decoded;
        }
        const nested = u.searchParams.get('url') || u.searchParams.get('u');
        return nested || decoded;
    } catch (_) {
        return decodeHtmlEntities(url);
    }
}

function isDirectVacancyUrl(url) {
    try {
        const decoded = decodeHtmlEntities(url);
        const u = new URL(decoded);
        if (!/glassdoor\.com$/i.test(u.hostname.replace(/^www\./i, ''))) return false;
        const pathname = String(u.pathname || '');
        const hasIdParam = Boolean(u.searchParams.get('jl') || u.searchParams.get('jobListingId'));
        if (hasIdParam) return true;
        if (/\/partner\/jobListing\.htm/i.test(pathname)) return true;
        if (/\/job-listing\//i.test(pathname)) return true;
        return false;
    } catch (_) {
        return false;
    }
}

/**
 * Parse structured job cards from Glassdoor HTML email body.
 * Glassdoor uses table-based HTML emails with <a> blocks linking to /partner/jobListing.htm.
 * Each job card in the email has: company+rating, title, location, salary, easyApply badge, posted age.
 *
 * Strategy: find all <a href="...jobListing.htm..."> blocks, then extract the surrounding
 * text content that contains the structured job data.
 */
function parseJobCardsFromHtml(htmlBodies) {
    const cards = [];
    const seenJobListingIds = new Set();

    for (const html of htmlBodies) {
        if (!html || !html.includes('jobListing')) continue;

        // Glassdoor emails wrap each job in a table row or <a> block.
        // We extract each <a href="...jobListing.htm...">...inner content...</a>
        // The inner content contains the structured job data.
        const linkBlockRegex = /<a\s[^>]*href\s*=\s*["']([^"']*jobListing[^"']*)["'][^>]*>((?:(?!<\/a>).)*)<\/a>/gis;
        let match;

        while ((match = linkBlockRegex.exec(html)) !== null) {
            const rawHref = match[1];
            const innerHtml = match[2];

            // Must be a Glassdoor vacancy link
            if (!/glassdoor\.com/i.test(rawHref) && !/jobListingId/i.test(rawHref)) continue;

            const decodedHref = decodeHtmlEntities(rawHref);
            let jobListingId = '';
            try {
                const u = new URL(decodedHref);
                jobListingId = u.searchParams.get('jobListingId') || u.searchParams.get('jl') || '';
            } catch (_) {
                // Try extracting from raw string
                const idMatch = rawHref.match(/jobListingId=([^&"']+)/i);
                if (idMatch) jobListingId = decodeHtmlEntities(idMatch[1]);
            }

            if (!jobListingId) continue;
            if (seenJobListingIds.has(jobListingId)) continue;
            seenJobListingIds.add(jobListingId);

            // Extract text content from the inner HTML
            const innerText = stripHtmlTags(innerHtml);
            if (!innerText || innerText.length < 5) continue;

            // Try to extract structured data from inner text or surrounding context
            // The email HTML typically has the structure:
            // "Company Rating ★\n Title\n Location\n Salary\n Easy Apply\n Xd"
            const card = parseCardText(innerText, rawHref, jobListingId);
            if (card) cards.push(card);
        }

        // If the <a> block parsing didn't yield good results,
        // try a broader approach: find all jobListing URLs and extract surrounding text
        if (cards.length === 0) {
            const urlRegex = /href\s*=\s*["']([^"']*\/partner\/jobListing\.htm[^"']*)["']/gi;
            let urlMatch;
            while ((urlMatch = urlRegex.exec(html)) !== null) {
                const rawHref = urlMatch[1];
                const decodedHref = decodeHtmlEntities(rawHref);

                let jobListingId = '';
                try {
                    const u = new URL(decodedHref);
                    jobListingId = u.searchParams.get('jobListingId') || '';
                } catch (_) {
                    const idMatch = rawHref.match(/jobListingId=([^&"']+)/i);
                    if (idMatch) jobListingId = decodeHtmlEntities(idMatch[1]);
                }

                if (!jobListingId || seenJobListingIds.has(jobListingId)) continue;
                seenJobListingIds.add(jobListingId);

                // Extract surrounding text (up to 500 chars around the link)
                const linkPos = html.indexOf(rawHref);
                const start = Math.max(0, linkPos - 800);
                const end = Math.min(html.length, linkPos + rawHref.length + 200);
                const context = stripHtmlTags(html.slice(start, end));

                const card = parseCardText(context, rawHref, jobListingId);
                if (card) cards.push(card);
            }
        }
    }

    return cards;
}

function parseCardText(text, rawHref, jobListingId) {
    let posted = parsePostedFromUtm(rawHref);
    const canonicalLink = buildCanonicalLink(rawHref);
    const id = `gd_${jobListingId}`;

    // Split text into lines (from stripHtmlTags boundaries)
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);

    // Extract rating: number followed by ★ or star-like characters
    let rating = null;
    const fullText = lines.join(' ');
    if (!posted) posted = parsePostedFromText(fullText);
    const ratingMatch = fullText.match(/(\d+\.?\d*)\s*[★⭐✩✪✫✬✭]/)
        || fullText.match(/[★⭐✩✪✫✬✭]\s*(\d+\.?\d*)/);
    if (ratingMatch) {
        const r = Number.parseFloat(ratingMatch[1]);
        if (Number.isFinite(r) && r >= 1.0 && r <= 5.0) rating = r;
    }

    // Extract salary
    let salary = null;
    const salaryRegex = /[£$€]\d+[\dK.,\s]*(?:-[\s]*[£$€]?\d+[\dK.,\s]*)?(?:\([^)]*\))?/i;
    const salaryMatch = fullText.match(salaryRegex);
    if (salaryMatch) {
        salary = salaryMatch[0].trim();
    }

    // Extract Easy Apply
    const easyApply = /easy\s*apply/i.test(fullText);

    // Clean each line: remove rating/stars, Easy Apply, salary, posted age indicators
    const cleanLine = (line) => line
        .replace(/(\d+\.?\d*)\s*[★⭐✩✪✫✬✭]/g, '')
        .replace(/[★⭐✩✪✫✬✭]/g, '')
        .replace(/[✦⚡]\s*Easy\s*Apply/gi, '')
        .replace(/Easy\s*Apply/gi, '')
        .replace(/[£$€]\d+[\dK.,\s]*(?:-[\s]*[£$€]?\d+[\dK.,\s]*)?(?:\([^)]*\))?/gi, '')
        .replace(/\b\d+(?:\.\d+)?\s*(?:[hdwm]|hours?|hrs?|days?|weeks?|mins?|minutes?)\b/gi, '')
        .replace(/Just\s*posted/gi, '')
        .replace(/<1d/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const cleaned = lines.map(cleanLine).filter(Boolean);

    let company = 'Unknown Company';
    let title = '';
    let location = null;

    if (cleaned.length >= 3) {
        company = cleaned[0];
        title = cleaned[1];
        location = cleaned[2];
    } else if (cleaned.length === 2) {
        company = cleaned[0];
        title = cleaned[1];
    } else if (cleaned.length === 1) {
        // All on one line — try to extract location from the end
        const singleLine = cleaned[0];

        // Try to match known location patterns at the end: "City, ST" or "Remote" or "United States"
        const locMatch = singleLine.match(/^(.+?)\s+((?:Remote|United States|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}))$/);
        if (locMatch) {
            const beforeLoc = locMatch[1].trim();
            location = locMatch[2].trim();
            // Try to split company from title — company is often shorter, title is the longer part
            // Look for a natural break
            title = beforeLoc;
        } else {
            title = singleLine;
        }
    }

    // Dedupe: if title equals company
    if (title && company !== 'Unknown Company' && title.toLowerCase() === company.toLowerCase()) {
        title = '';
    }

    if (!title) return null;

    return {
        id,
        title: normalizeText(title),
        company: normalizeText(company),
        rating,
        location: location ? normalizeText(location) : null,
        salary,
        easyApply,
        posted: normalizePosted(posted),
        posted_days: getPostedDays(posted),
        link: canonicalLink,
        source: 'glassdoor',
        description: '',
    };
}

function collectBodiesFromPayload(payload, allBodies, htmlBodies) {
    if (!payload) return;
    if (payload.body && payload.body.data) {
        const mime = String(payload.mimeType || '').toLowerCase();
        const decoded = base64UrlDecode(payload.body.data);
        if (mime.includes('text/html')) {
            allBodies.push(decoded);
            htmlBodies.push(decoded);
        } else if (mime.includes('text/plain')) {
            allBodies.push(decoded);
        }
    }
    if (Array.isArray(payload.parts)) {
        payload.parts.forEach((part) => collectBodiesFromPayload(part, allBodies, htmlBodies));
    }
}

function extractUrlsFromText(text) {
    const matches = String(text || '').match(/https?:\/\/[^\s"'<>]+/gi) || [];
    return matches.map((m) => decodeHtmlEntities(m.replace(/[)>.,;]+$/g, '')));
}

async function postForm(url, params) {
    const body = new URLSearchParams(params);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return response.json();
}

async function refreshAccessToken(token) {
    const refreshed = await postForm('https://oauth2.googleapis.com/token', {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
    });

    const merged = {
        ...token,
        ...refreshed,
        created_at: Date.now(),
        refresh_token: token.refresh_token || refreshed.refresh_token,
    };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    return merged;
}

async function gmailGet(pathname, accessToken) {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathname}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gmail API ${response.status}: ${text}`);
    }
    return response.json();
}

async function gmailPost(pathname, accessToken, body) {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathname}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body || {}),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gmail API ${response.status}: ${text}`);
    }
    return response.json();
}

async function resolveLabelId(accessToken, labelName) {
    const list = await gmailGet('labels', accessToken);
    const labels = Array.isArray(list.labels) ? list.labels : [];
    const found = labels.find((l) => String(l.name || '').toLowerCase() === String(labelName || '').toLowerCase());
    if (!found || !found.id) {
        throw new Error(`Gmail label not found: ${labelName}`);
    }
    return found.id;
}

function buildEffectiveQuery(baseQuery, onlyUnread) {
    const parts = [];
    if (onlyUnread) parts.push('is:unread');
    const q = normalizeText(baseQuery);
    if (q) parts.push(q);
    const hasExplicitTimeFilter = /(?:\bnewer_than:|\bolder_than:|\bafter:\d{4}\/\d{1,2}\/\d{1,2}|\bbefore:\d{4}\/\d{1,2}\/\d{1,2})/i.test(q);
    if (!hasExplicitTimeFilter && TIME_WINDOW !== 'all') {
        if (TIME_WINDOW === 'today') {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = now.getMonth() + 1;
            const dd = now.getDate();
            parts.push(`after:${yyyy}/${mm}/${dd}`);
        } else {
            parts.push(`newer_than:${TIME_WINDOW}`);
        }
    }
    return parts.join(' ').trim();
}

function isTimestampFromCurrentDay(timestampMs) {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return false;
    const date = new Date(timestampMs);
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

function derivePostedFromMessageTimestamp(timestampMs) {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '';
    const ageHours = (Date.now() - timestampMs) / (1000 * 60 * 60);
    if (!Number.isFinite(ageHours) || ageHours < 0) return '';
    if (ageHours < 1) return '1h';
    if (ageHours < 24) return `${Math.max(1, Math.round(ageHours))}h`;
    const ageDays = ageHours / 24;
    if (ageDays < 7) return `${Math.max(1, Number(ageDays.toFixed(1)))}d`;
    return `${Math.max(1, Math.round(ageDays / 7))}w`;
}

function guessCompany(subject) {
    const s = normalizeText(subject);
    const m = s.match(/at\s+([^|,\-:]+)$/i);
    return m ? normalizeText(m[1]) : 'Unknown Company';
}

function isStillAvailableMessage(subject) {
    const s = normalizeText(subject).toLowerCase();
    return /\bstill\s+available\b/.test(s) || /\bapply\s+soon\b/.test(s);
}

function shouldSkipMessage(subject, bodies, htmlCards) {
    const plainBody = String(Array.isArray(bodies) ? bodies.join('\n') : '');
    const subjectNorm = normalizeText(subject).toLowerCase();
    const cards = Array.isArray(htmlCards) ? htmlCards : [];
    const alertTitles = [];
    const re = /job\s*alert:\s*([^\n\r<]{2,120})/gi;
    let m;
    while ((m = re.exec(plainBody)) !== null) {
        const title = normalizeText(m[1]).toLowerCase();
        if (title) alertTitles.push(title);
    }

    if (alertTitles.length > 0) {
        const joinedTitles = alertTitles.join(' ');
        if (MESSAGE_INCLUDE.length > 0) {
            const includeHit = MESSAGE_INCLUDE.some((pattern) => joinedTitles.includes(pattern));
            if (!includeHit) {
                return { skip: true, touch: false, reason: 'no target job alert in body' };
            }
        }
        const excluded = MESSAGE_EXCLUDE.some((pattern) => joinedTitles.includes(pattern));
        if (excluded) {
            return { skip: true, touch: false, reason: 'excluded job alert in body' };
        }
        return { skip: false, touch: true, reason: '' };
    }

    if (cards.length > 0) {
        const cardsText = cards
            .map((card) => `${normalizeText(card.title)} ${normalizeText(card.company)} ${normalizeText(card.location || '')}`)
            .join(' ')
            .toLowerCase();

        if (MESSAGE_INCLUDE.length > 0) {
            const includeHit = MESSAGE_INCLUDE.some((pattern) => cardsText.includes(pattern) || subjectNorm.includes(pattern));
            if (!includeHit) {
                return { skip: true, touch: false, reason: 'no target role in structured cards' };
            }
        }

        const excluded = MESSAGE_EXCLUDE.some((pattern) => cardsText.includes(pattern) || subjectNorm.includes(pattern));
        if (excluded) {
            return { skip: true, touch: false, reason: 'excluded role in structured cards' };
        }

        return { skip: false, touch: true, reason: '' };
    }

    return { skip: true, touch: false, reason: 'no Job alert title in body' };
}

function normalizeMultilineText(value) {
    return String(value || '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveChromePath() {
    if (CHROME_PATH_CFG) return CHROME_PATH_CFG;

    const candidates = [];
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        candidates.push(
            `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
            `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
            `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`
        );
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    } else {
        candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium');
    }

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function findJobPostingNode(node, depth = 0) {
    if (!node || depth > 8) return null;
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findJobPostingNode(item, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (typeof node !== 'object') return null;

    const nodeType = node['@type'];
    if (nodeType === 'JobPosting' || (Array.isArray(nodeType) && nodeType.includes('JobPosting'))) {
        return node;
    }

    for (const value of Object.values(node)) {
        const found = findJobPostingNode(value, depth + 1);
        if (found) return found;
    }
    return null;
}

function extractDescriptionFromJsonLdDom(dom) {
    const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(String(dom || ''))) !== null) {
        const jsonText = String(match[1] || '').trim();
        if (!jsonText) continue;

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (_) {
            continue;
        }

        const posting = findJobPostingNode(parsed);
        const descriptionHtml = posting && typeof posting.description === 'string' ? posting.description : '';
        if (!descriptionHtml) continue;

        const prepared = descriptionHtml
            .replace(/<li>/gi, '- ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|li|ul|ol|h[1-6]|div|section|article)>/gi, '\n');
        const descriptionText = normalizeMultilineText(stripHtmlTags(prepared));
        if (descriptionText) return descriptionText;
    }

    return '';
}

function runChromeDumpDom(url, chromePath) {
    const args = [
        '--headless=new',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        `--user-agent=${CHROME_USER_AGENT}`,
        '--dump-dom',
        url,
    ];

    const result = spawnSync(chromePath, args, {
        encoding: 'utf8',
        timeout: CHROME_TIMEOUT_MS,
        maxBuffer: 30 * 1024 * 1024,
    });

    if (result.error) {
        throw new Error(`Chrome failed: ${result.error.message}`);
    }

    const dom = String(result.stdout || '');
    if (!dom.trim()) {
        const stderr = String(result.stderr || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(' | ');
        throw new Error(stderr ? `Chrome returned empty DOM (${stderr})` : 'Chrome returned empty DOM');
    }

    return dom;
}

function shouldHydrateVacancy(vacancy, newIds) {
    if (!isRecentVacancy(vacancy)) return false;
    const canonical = buildCanonicalLink(vacancy.link || '');
    if (!canonical || !isDirectVacancyUrl(canonical)) return false;

    if (HYDRATE_SCOPE === 'all') return true;
    if (HYDRATE_SCOPE === 'new') return newIds.has(vacancy.id);
    return !normalizeText(vacancy.description);
}

async function hydrateDescriptionsWithChrome(vacancies, newIds) {
    if (!HYDRATE_DESCRIPTIONS) {
        return { enabled: false, attempted: 0, filled: 0, failed: 0, warning: '' };
    }

    const chromePath = resolveChromePath();
    if (!chromePath) {
        return {
            enabled: true,
            attempted: 0,
            filled: 0,
            failed: 0,
            warning: 'Chrome executable not found; set CHROME_PATH in .env',
        };
    }

    const targets = vacancies.filter((vacancy) => shouldHydrateVacancy(vacancy, newIds));
    if (targets.length > 0) {
        console.log(`Hydrating descriptions with Chrome: ${targets.length} vacancy(s)...`);
    }

    const cache = new Map();
    let attempted = 0;
    let filled = 0;
    let failed = 0;

    for (let index = 0; index < targets.length; index += 1) {
        const vacancy = targets[index];
        attempted += 1;

        const canonical = buildCanonicalLink(vacancy.link || '');
        console.log(`[hydrate ${index + 1}/${targets.length}] ${vacancy.id} -> ${canonical}`);
        let description = cache.get(canonical);
        if (description === undefined) {
            try {
                const delayMs = randomInt(HYDRATE_DELAY_MIN_MS, HYDRATE_DELAY_MAX_MS);
                console.log(`[hydrate ${index + 1}/${targets.length}] waiting ${delayMs}ms before request`);
                await sleep(delayMs);
                const dom = runChromeDumpDom(canonical, chromePath);
                description = extractDescriptionFromJsonLdDom(dom);
            } catch (error) {
                description = '';
                console.warn(`Description fetch failed for ${canonical}: ${error.message}`);
            }
            cache.set(canonical, description);
        }

        if (description) {
            vacancy.description = description;
            filled += 1;
        } else {
            failed += 1;
        }
    }

    return { enabled: true, attempted, filled, failed, warning: '' };
}

async function sendAuthErrorTelegram() {
    const token = getCfg('TELEGRAM_BOT_TOKEN');
    const chatId = getCfg('TELEGRAM_CHAT_ID');
    const topicId = getCfg('TELEGRAM_TOPIC_ID');
    if (!token || !chatId) return;

    const text = '⚠️ <b>Ошибка авторизации Gmail</b>\n\nОткройте терминал и запустите скрипт авторизации:\n<pre>bash\nnode scripts/gmail_auth.js</pre>';
    try {
        const body = {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
        };
        if (topicId) body.message_thread_id = Number.parseInt(topicId, 10);
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error('Failed to send Telegram error notification:', e.message);
    }
}

(async () => {
    try {
        ensureEnv();
        if (!fs.existsSync(TOKEN_PATH)) {
            throw new Error('Missing auth/gmail_token.json. Run: npm run gmail:auth');
        }

        let token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        if (!token.access_token || !token.refresh_token) {
            throw new Error('Invalid gmail token file. Run: npm run gmail:auth');
        }
        token = await refreshAccessToken(token);

        console.log('Starting Gmail API -> Glassdoor parser...');
        const effectiveQuery = buildEffectiveQuery(QUERY, ONLY_UNREAD);
        const labelId = await resolveLabelId(token.access_token, LABEL_NAME);
        console.log(`Label: ${LABEL_NAME} (${labelId})`);
        console.log(`Query: ${effectiveQuery || '(none)'}`);
        console.log(`Description hydrate via Chrome: ${HYDRATE_DESCRIPTIONS ? `on (scope=${HYDRATE_SCOPE})` : 'off'}`);
        console.log(`Recency gate for pipeline: <=${MAX_POSTED_DAYS} day(s) (${MAX_POSTED_HOURS.toFixed(1)}h)`);

        const list = await gmailGet(
            `messages?labelIds=${encodeURIComponent(labelId)}&q=${encodeURIComponent(effectiveQuery)}&maxResults=${Number.isFinite(MAX_EMAILS) ? MAX_EMAILS : 20}`,
            token.access_token
        );

        const messageIds = Array.isArray(list.messages) ? list.messages.map((m) => m.id).filter(Boolean) : [];
        console.log(`Emails matched: ${messageIds.length}`);

        const seenLinks = new Set();
        const allFound = [];
        const extractedLog = [];
        let markedRead = 0;
        let markReadFailed = 0;
        let skippedByFilter = 0;
        let skippedUntouched = 0;
        let skippedByRegion = 0;
        let skippedByMailDate = 0;

        for (const messageId of messageIds) {
            const msg = await gmailGet(`messages/${encodeURIComponent(messageId)}?format=full`, token.access_token);
            const headers = Array.isArray(msg.payload?.headers) ? msg.payload.headers : [];
            const subject = normalizeText(headers.find((h) => String(h.name).toLowerCase() === 'subject')?.value || '');
            const dateHeader = normalizeText(headers.find((h) => String(h.name).toLowerCase() === 'date')?.value || '');
            const internalDate = Number.parseInt(msg.internalDate || '0', 10);
            const internalDateIso = Number.isFinite(internalDate) && internalDate > 0 ? new Date(internalDate).toISOString() : '';
            console.log(`Processing message: ${subject || '(no subject)'} | date: ${dateHeader || internalDateIso || 'unknown'}`);

            if (ENFORCE_TODAY_MAIL_ONLY && !isTimestampFromCurrentDay(internalDate)) {
                skippedByMailDate += 1;
                console.log(`Skipped by mail date (not current day): ${subject || '(no subject)'}`);
                continue;
            }

            const bodies = [];
            const htmlBodies = [];
            collectBodiesFromPayload(msg.payload, bodies, htmlBodies);

            const htmlCards = parseJobCardsFromHtml(htmlBodies.length > 0 ? htmlBodies : bodies);
            const decision = shouldSkipMessage(subject, bodies, htmlCards);
            if (decision.skip) {
                skippedByFilter += 1;
                console.log(`Skipped by content filter (${decision.reason}): ${subject}`);
                if (decision.touch) {
                    try {
                        await gmailPost(`messages/${encodeURIComponent(messageId)}/modify`, token.access_token, {
                            removeLabelIds: ['UNREAD'],
                        });
                        markedRead += 1;
                    } catch (e) {
                        markReadFailed += 1;
                        console.warn(`Failed to mark as read for skipped message ${messageId}: ${e.message}`);
                    }
                } else {
                    skippedUntouched += 1;
                }
                continue;
            }

            const postedFromBody = parsePostedFromText(`${subject}\n${bodies.join('\n')}`);
            const messagePostedFallback = postedFromBody || derivePostedFromMessageTimestamp(internalDate);
            const stillAvailableMail = isStillAvailableMessage(subject);

            // ─── PRIMARY: parse structured job cards from HTML bodies ────────
            if (htmlCards.length > 0) {
                console.log(`HTML parser: extracted ${htmlCards.length} structured job cards from email.`);
                for (const card of htmlCards) {
                    if (seenLinks.has(card.id)) continue;
                    seenLinks.add(card.id);

                    const postedValue = normalizePosted(card.posted) || messagePostedFallback;
                    const normalizedPosted = normalizePosted(postedValue);
                    const normalizedCard = {
                        ...card,
                        posted: normalizedPosted,
                        posted_days: getPostedDays(normalizedPosted),
                        still_available_mail: stillAvailableMail,
                    };

                    allFound.push(normalizedCard);
                    extractedLog.push({ subject: normalizedCard.title, link: normalizedCard.link, company: normalizedCard.company });
                }
            } else {
                // ─── FALLBACK: regex URL extraction (old behavior) ───────────
                console.log('HTML parser found 0 cards, falling back to URL regex extraction.');
                const urls = bodies.flatMap(extractUrlsFromText);

                for (const rawUrl of urls) {
                    const decoded = normalizeText(decodeTrackedUrl(rawUrl));
                    if (!decoded || seenLinks.has(decoded)) continue;
                    if (!isDirectVacancyUrl(decoded)) continue;

                    seenLinks.add(decoded);
                    const postedValue = parsePostedFromUtm(decoded) || messagePostedFallback;
                    const vacancy = {
                        id: extractIdFromGlassdoorUrl(decoded),
                        title: subject || 'Glassdoor vacancy from email',
                        company: guessCompany(subject),
                        rating: null,
                        location: null,
                        salary: null,
                        easyApply: false,
                        posted: normalizePosted(postedValue),
                        posted_days: getPostedDays(postedValue),
                        still_available_mail: stillAvailableMail,
                        link: buildCanonicalLink(decoded),
                        source: 'glassdoor',
                        description: '',
                    };
                    allFound.push(vacancy);
                    extractedLog.push({ subject: vacancy.title, link: vacancy.link });
                }
            }

            // Mark processed message as read so next run picks only new mail.
            try {
                await gmailPost(`messages/${encodeURIComponent(messageId)}/modify`, token.access_token, {
                    removeLabelIds: ['UNREAD'],
                });
                markedRead += 1;
            } catch (e) {
                markReadFailed += 1;
                console.warn(`Failed to mark as read for message ${messageId}: ${e.message}`);
            }
        }

        const portugalFound = allFound.filter((v) => isPortugalVacancy(v));
        skippedByRegion = allFound.length - portugalFound.length;
        const freshFound = portugalFound.filter((v) => isRecentVacancy(v));
        console.log(`Portugal region filter: kept=${portugalFound.length}, skipped=${skippedByRegion}`);
        console.log(`Recency filter (<=${MAX_POSTED_DAYS}d): kept=${freshFound.length}, skipped=${portugalFound.length - freshFound.length}`);

        const existing = readJsonArray(VACANCIES_PATH).filter((v) => isPortugalVacancy(v) && isRecentVacancy(v));
        const existingMap = new Map(existing.map((v) => [v.id, v]));
        const newIds = new Set();
        freshFound.forEach((v) => {
            const current = existingMap.get(v.id) || {};
            const merged = { ...current, ...v };
            if (!normalizeText(merged.description) && normalizeText(current.description)) {
                merged.description = current.description;
            }
            existingMap.set(v.id, merged);
            newIds.add(v.id);
        });

        const mergedVacancies = Array.from(existingMap.values()).filter((v) => isPortugalVacancy(v) && isRecentVacancy(v));
        const hydrate = await hydrateDescriptionsWithChrome(mergedVacancies, newIds);
        if (hydrate.warning) {
            console.warn(hydrate.warning);
        }
        if (hydrate.enabled) {
            console.log(`Description hydrate done: attempted=${hydrate.attempted}, filled=${hydrate.filled}, failed=${hydrate.failed}`);
        }

        const seenIds = readJsonArray(SEEN_IDS_PATH);
        const seenSet = new Set(seenIds);
        freshFound.forEach((v) => {
            if (!seenSet.has(v.id)) {
                seenSet.add(v.id);
                seenIds.push(v.id);
            }
        });

        fs.writeFileSync(VACANCIES_PATH, JSON.stringify(mergedVacancies, null, 2));
        fs.writeFileSync(SEEN_IDS_PATH, JSON.stringify(seenIds, null, 2));

        console.log(`Done. Extracted ${allFound.length} Glassdoor links from Gmail API.`);
        console.log(`Recent vacancies in pipeline (<=${MAX_POSTED_DAYS}d): ${freshFound.length}`);
        console.log(`Skipped by region (not Portugal): ${skippedByRegion}`);
        console.log(`Skipped by mail date (not current day): ${skippedByMailDate}`);
        console.log(`Skipped by filter: ${skippedByFilter} message(s).`);
        console.log(`Skipped untouched: ${skippedUntouched} message(s).`);
        console.log(`Marked as read: ${markedRead} message(s).`);
        if (markReadFailed > 0) {
            console.warn(`Mark-as-read failed: ${markReadFailed} message(s). Run npm run gmail:auth again to grant gmail.modify.`);
        }
        if (extractedLog.length > 0) {
            console.log('Extracted links:');
            extractedLog.forEach((item, idx) => {
                console.log(`${idx + 1}. ${item.link} | ${item.subject}`);
            });
        }
        console.log(`Saved to data/vacancies_mail_glassdoor.json (total: ${mergedVacancies.length}).`);
    } catch (error) {
        console.error('parse_gmail_glassdoor failed:', error.message);
        
        if (error.message.includes('invalid_grant') || error.message.includes('Token has been expired') || error.message.includes('Missing auth/gmail_token.json')) {
            const authMessage = '\n============================================================\n' +
                                'ОШИБКА АВТОРИЗАЦИИ GMAIL\n' +
                                'Откройте терминал и запустите скрипт авторизации:\n' +
                                'bash\nnode scripts/gmail_auth.js\n' +
                                '============================================================\n';
            console.error(authMessage);
            await sendAuthErrorTelegram();
        }

        process.exitCode = 1;
    }
})();
