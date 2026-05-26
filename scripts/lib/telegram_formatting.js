const { getPostedDays } = require('./vacancy_utils');

function isApplyDecision(vacancy) {
    if (vacancy && typeof vacancy.decision === 'string') return vacancy.decision === 'apply';
    if (vacancy && typeof vacancy.relevant === 'boolean') return vacancy.relevant;
    return Number(vacancy && vacancy.score) >= 60;
}

function inferSeniority(title) {
    const t = String(title || '').toLowerCase();
    if (/(principal|staff)/.test(t)) return 'Principal/Staff+';
    if (/(lead|senior|sr\b|snr\b)/.test(t)) return 'Senior+';
    if (/(junior|jr\b|jnr\b|intern|trainee)/.test(t)) return 'Junior';
    return 'Mid';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(value) {
    const v = String(value || '').trim();
    if (!/^https?:\/\//i.test(v)) return '';
    return v.replace(/"/g, '%22');
}

function shortRating(vacancy) {
    const raw = String(vacancy.rating || '').trim();
    if (!raw) return null;
    const num = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(num)) return null;
    return num.toFixed(1);
}

function summarizeReasons(vacancy) {
    const reasons = Array.isArray(vacancy.reasons)
        ? vacancy.reasons
        : String(vacancy.reasoning || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);

    const plus = reasons
        .filter((r) => /^\+/.test(r))
        .slice(0, 2)
        .map((r) => r.replace(/^\+\s*/, '').trim());
    const minus = reasons
        .filter((r) => /^-/.test(r))
        .slice(0, 2)
        .map((r) => r.replace(/^-\s*/, '').trim());

    return { plus, minus };
}

function buildShortComment(vacancy, underMode) {
    const parts = [];
    const seniority = inferSeniority(vacancy.title);
    const postedDays = Number.isFinite(vacancy.posted_days) ? vacancy.posted_days : getPostedDays(vacancy.posted);
    if (Number.isFinite(postedDays)) parts.push(`${postedDays}d`);
    if (vacancy.easyApply) parts.push('Easy Apply');
    parts.push(seniority);
    const location = String(vacancy.location || '').replace(/\s+/g, ' ').trim();
    const salary = String(vacancy.salary || '').replace(/\s+/g, ' ').trim();
    if (location) parts.push(`Location: ${location}`);
    if (salary) parts.push(`Salary: ${salary}`);

    const rating = shortRating(vacancy);
    parts.push(rating ? `${vacancy.company} ⭐${rating}` : `${vacancy.company}`);

    const summary = summarizeReasons(vacancy);
    if (summary.plus.length) parts.push(`Plus: ${summary.plus.join(' | ')}`);
    if (summary.minus.length) parts.push(`Minus: ${summary.minus.join(' | ')}`);

    if (underMode) {
        const why = [];
        if (Number(vacancy.score) < 60) why.push(`score ${vacancy.score}<60`);
        if (vacancy.decision === 'do_not_apply_now') why.push('decision do_not_apply_now');
        if (vacancy.resume_self_check_passed === false) {
            const missing = Array.isArray(vacancy.missing_mandatory_requirements) ? vacancy.missing_mandatory_requirements : [];
            if (missing.length) why.push(`missing: ${missing.join(', ')}`);
            else why.push('resume-check failed');
        }
        if (why.length) parts.push(`Reason: ${why.join('; ')}`);
    }

    return `${parts.join('. ')}.`;
}

function formatVacancyLine(vacancy, underMode) {
    const mark = underMode ? '⚠️' : '✅';
    const score = Number.isFinite(vacancy.score) ? vacancy.score : 0;
    const title = escapeHtml(String(vacancy.title || 'Untitled').replace(/\s+/g, ' ').trim());
    const company = escapeHtml(String(vacancy.company || 'Unknown').replace(/\s+/g, ' ').trim());
    const url = safeUrl(vacancy.link);
    const titlePart = url ? `<a href="${url}">${title}</a>` : title;
    const companyPart = url ? `<a href="${url}">${company}</a>` : company;
    const line1 = `${mark} ${score}% ${titlePart} | ${companyPart}`;
    const line2 = `   ${escapeHtml(buildShortComment(vacancy, underMode))}`;
    return `${line1}\n${line2}`;
}

function formatNotionVacancyLine(vacancy) {
    const base = formatVacancyLine(vacancy, false);
    const notionUrl = safeUrl(vacancy && vacancy.notion_page_url);
    const notionPart = notionUrl ? `<a href="${notionUrl}">Notion</a>` : 'Notion';
    const status = escapeHtml(String(vacancy && vacancy.notion_status || 'Unknown'));
    const matchType = escapeHtml(String(vacancy && vacancy.notion_match_type || 'unknown').replace(/_/g, '+'));
    return `${base}\n   ${notionPart}. Status: ${status}. Match: ${matchType}.`;
}

function selectTelegramVacancies(vacancies, options = {}) {
    const { underMode = false } = options;
    const rows = Array.isArray(vacancies) ? vacancies : [];

    if (underMode) {
        return rows.filter((v) => Number(v.score) < 60 || v.resume_self_check_passed === false || v.decision === 'do_not_apply_now');
    }

    return rows.filter((v) => isApplyDecision(v) && v.resume_self_check_passed === true);
}

module.exports = {
    buildShortComment,
    escapeHtml,
    formatNotionVacancyLine,
    formatVacancyLine,
    inferSeniority,
    selectTelegramVacancies,
    summarizeReasons,
};
