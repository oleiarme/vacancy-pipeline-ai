/**
 * orchestrator_checks.js
 */
const fs = require('fs');
const path = require('path');

function readJSON(fullPath) {
    if (!fs.existsSync(fullPath)) return null;
    try { return JSON.parse(fs.readFileSync(fullPath, 'utf8')); } catch { return null; }
}

function selfCheckVacancies(filePath, label, log) {
    const data = readJSON(filePath);
    const issues = [];

    if (!data) return { ok: false, issues: [`${filePath} missing or invalid JSON`] };
    if (!Array.isArray(data)) return { ok: false, issues: [`${filePath} is not an array`] };
    if (data.length === 0) return { ok: false, issues: [`${filePath} is empty`] };

    let nullTitles = 0, nullCompanies = 0, nullLinks = 0, badScores = 0;
    const idSet = new Set();
    let duplicates = 0;

    for (const v of data) {
        if (!v.title || v.title === 'Unknown Title' || v.title === 'null') nullTitles++;
        if (!v.company || v.company === 'Unknown Company' || v.company === 'null') nullCompanies++;
        if (!v.link || !v.link.startsWith('http')) nullLinks++;
        if (v.id) {
            if (idSet.has(v.id)) duplicates++;
            idSet.add(v.id);
        }
    }

    if (nullTitles > data.length * 0.3) issues.push(`  ${nullTitles}/${data.length} vacancies have null/unknown titles (>30% threshold)`);
    if (nullCompanies > data.length * 0.3) issues.push(`  ${nullCompanies}/${data.length} vacancies have null/unknown companies`);
    if (nullLinks > 0) issues.push(`  ${nullLinks} vacancies have invalid/missing links`);
    if (duplicates > 0) issues.push(`  ${duplicates} duplicate IDs detected`);

    log(issues.length === 0 ? 'ok' : 'warn', `${label}: ${data.length} vacancies | nullTitles:${nullTitles} | nullCompanies:${nullCompanies} | badLinks:${nullLinks} | dupes:${duplicates}`);
    return { ok: issues.length === 0, issues, count: data.length };
}

function selfCheckScored(log) {
    const data = readJSON(path.resolve(__dirname, '../../data/scored_vacancies.json'));
    const issues = [];

    if (!data || !Array.isArray(data))
        return { ok: false, issues: ['data/scored_vacancies.json missing or invalid'] };

    if (data.length === 0) {
        log('ok', 'data/scored_vacancies.json is empty (0 new vacancies). Skipping scoring checks.');
        return { ok: true, issues: [], total: 0, relevant: 0 };
    }

    let badScores = 0, missingReasoning = 0, outOfRange = 0, mandatoryGapWithoutComment = 0, badDecision = 0, inconsistentRelevant = 0;
    const relevant = data.filter(v => v.relevant === true);

    for (const v of data) {
        if (v.score === undefined || v.score === null) badScores++;
        if (v.score < 0 || v.score > 100) outOfRange++;
        if (!v.reasoning) missingReasoning++;
        if (!['apply', 'do_not_apply_now'].includes(String(v.decision || ''))) badDecision++;
        if (typeof v.decision === 'string' && Boolean(v.relevant) !== (v.decision === 'apply')) inconsistentRelevant++;
        const hasMissingMandatory = Array.isArray(v.missing_mandatory_requirements) && v.missing_mandatory_requirements.length > 0;
        if (v.relevant === true && hasMissingMandatory && !v.resume_check_comment) mandatoryGapWithoutComment++;
    }

    if (badScores > 0) issues.push(` ${badScores} vacancies missing score`);
    if (outOfRange > 0) issues.push(` ${outOfRange} vacancies have score out of 0-100 range`);
    if (relevant.length === 0) issues.push(`  No vacancies marked relevant/apply (check scoring logic)`);
    if (missingReasoning > data.length * 0.5) issues.push(`  ${missingReasoning}/${data.length} vacancies lack reasoning text (potential hallucination)`);
    if (mandatoryGapWithoutComment > 0) issues.push(` ${mandatoryGapWithoutComment} relevant vacancies have missing mandatory requirements but no resume_check_comment`);

    log(issues.length === 0 ? 'ok' : 'warn',
        `Scoring: ${data.length} total | ${relevant.length} relevant (decision=apply) | ${badScores} missing score | ${missingReasoning} missing reasoning | ${mandatoryGapWithoutComment} mandatory-gap-without-comment | ${badDecision} bad-decision | ${inconsistentRelevant} inconsistent-relevant`);

    return { ok: badScores === 0 && outOfRange === 0 && mandatoryGapWithoutComment === 0 && badDecision === 0 && inconsistentRelevant === 0, issues, total: data.length, relevant: relevant.length };
}

module.exports = {
    selfCheckVacancies,
    selfCheckScored
};
