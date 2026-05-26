/**
 * text_utils.js — shared text normalization primitives.
 * Eliminates duplicated normalizeText / normalizeSpace / normalizeWhitespace
 * that previously lived in 6+ files.
 */

/**
 * Collapse consecutive whitespace, trim edges.
 * Formerly: normalizeSpace (scoring_rules), normalizeText (linkedin_jobs_home,
 * linkedin_notifications), normalizeWhitespace (parse_linkedin).
 */
function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Collapse whitespace + lowercase.
 * Formerly: normalizeText (ignore_registry, notion_presence).
 */
function normalizeText(value) {
    return normalizeWhitespace(value).toLowerCase();
}

module.exports = {
    normalizeWhitespace,
    normalizeText,
};
