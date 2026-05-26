const fs = require('fs');
const path = require('path');
const {
    classifySkillGap,
    detectSkillsInText,
    extractMandatorySkills,
} = require('./lib/scoring_rules');
const { normalizeWhitespace } = require('./lib/text_utils');

const ROOT = path.resolve(__dirname, '..');
const RESUME_PATH = path.join(ROOT, 'config', 'resume.txt');
const SCORED_PATH = path.join(ROOT, 'data', 'scored_vacancies.json');
const RELEVANT_PATH = path.join(ROOT, 'data', 'relevant_vacancies.json');
const RELEVANT_COMMENTS_PATH = path.join(ROOT, 'reports', 'relevant_vacancy_comments.md');

const normalizeSpace = normalizeWhitespace;

function readJsonArray(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
}

function getVacancyText(vacancy) {
    return normalizeSpace([
        vacancy.title,
        vacancy.description,
        vacancy.requirements,
        vacancy.jobDescription,
        vacancy.responsibilities,
        vacancy.reasoning,
    ].filter(Boolean).join('\n'));
}

function buildComment(missingSkills) {
    if (missingSkills.length === 0) return '';
    return `Resume self-check: mandatory requirements not found in resume -> ${missingSkills.join(', ')}.`;
}

function shouldApply(vacancy) {
    if (vacancy && typeof vacancy.decision === 'string') return vacancy.decision === 'apply';
    if (vacancy && typeof vacancy.relevant === 'boolean') return vacancy.relevant;
    return Number(vacancy && vacancy.score) >= 60;
}

function getReasons(vacancy) {
    if (Array.isArray(vacancy.reasons)) return vacancy.reasons;
    return String(vacancy.reasoning || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
}

function exportRelevantArtifacts(vacancies) {
    const relevant = (vacancies || [])
        .filter((v) => shouldApply(v))
        .sort((a, b) => Number(b.score) - Number(a.score));

    const rows = relevant.map((v, idx) => {
        const missing = Array.isArray(v.missing_mandatory_requirements) ? v.missing_mandatory_requirements : [];
        const transferable = Array.isArray(v.soft_adjacent_missing_requirements) ? v.soft_adjacent_missing_requirements : [];
        const action = v.resume_self_check_passed ? 'approve' : 'reject';
        const actionReason = action === 'approve'
            ? 'passes score + resume self-check'
            : (missing.length ? `mandatory hard gaps: ${missing.join(', ')}` : 'resume self-check failed');

        return {
            index: idx + 1,
            id: v.id,
            source: v.source || '',
            title: v.title || '',
            company: v.company || '',
            score: Number(v.score) || 0,
            link: v.link || '',
            action,
            action_reason: actionReason,
            resume_self_check_passed: Boolean(v.resume_self_check_passed),
            mandatory_requirements_detected: Array.isArray(v.mandatory_requirements_detected) ? v.mandatory_requirements_detected : [],
            missing_mandatory_requirements: missing,
            soft_adjacent_missing_requirements: transferable,
            resume_check_comment: v.resume_check_comment || '',
            reasons: getReasons(v),
        };
    });

    fs.mkdirSync(path.dirname(RELEVANT_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(RELEVANT_COMMENTS_PATH), { recursive: true });
    fs.writeFileSync(RELEVANT_PATH, JSON.stringify(rows, null, 2));

    const lines = [];
    lines.push(`# Relevant Vacancy Decisions (${rows.length})`);
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('| # | Score | Action | Source | Title | Company | Hard gaps | Transferable gaps | Reason |');
    lines.push('|---|---:|---|---|---|---|---|---|---|');
    rows.forEach((r) => {
        const missing = r.missing_mandatory_requirements.length ? r.missing_mandatory_requirements.join(', ') : '-';
        const transferable = r.soft_adjacent_missing_requirements.length ? r.soft_adjacent_missing_requirements.join(', ') : '-';
        const source = r.source || '-';
        const title = String(r.title || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
        const company = String(r.company || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
        const reason = String(r.action_reason || '').replace(/\|/g, '\\|');
        lines.push(`| ${r.index} | ${r.score} | ${r.action} | ${source} | ${title} | ${company} | ${missing} | ${transferable} | ${reason} |`);
    });

    lines.push('');
    lines.push('## Per Vacancy Comments');
    lines.push('');
    rows.forEach((r) => {
        lines.push(`### ${r.index}. ${r.title} (${r.id})`);
        lines.push(`- Score: ${r.score}`);
        lines.push(`- Action: ${r.action}`);
        lines.push(`- Reason: ${r.action_reason}`);
        lines.push(`- Resume check: ${r.resume_self_check_passed ? 'passed' : 'failed'}`);
        lines.push(`- Hard gaps: ${r.missing_mandatory_requirements.length ? r.missing_mandatory_requirements.join(', ') : 'none'}`);
        lines.push(`- Transferable gaps: ${r.soft_adjacent_missing_requirements.length ? r.soft_adjacent_missing_requirements.join(', ') : 'none'}`);
        lines.push(`- Link: ${r.link || '-'}`);
        if (r.reasons.length > 0) {
            lines.push('- Scoring reasons:');
            r.reasons.forEach((reason) => lines.push(`  - ${reason}`));
        }
        if (r.resume_check_comment) {
            lines.push(`- Resume comment: ${r.resume_check_comment}`);
        }
        lines.push('');
    });

    fs.writeFileSync(RELEVANT_COMMENTS_PATH, `${lines.join('\n')}\n`);
    console.log(`resume_self_check: saved ${rows.length} records to ${path.relative(ROOT, RELEVANT_PATH)}`);
    console.log(`resume_self_check: saved comments to ${path.relative(ROOT, RELEVANT_COMMENTS_PATH)}`);
}

function run() {
    const resumeText = fs.existsSync(RESUME_PATH) ? fs.readFileSync(RESUME_PATH, 'utf8') : '';
    if (!resumeText) {
        console.error('resume_self_check: config/resume.txt is missing or empty');
        process.exit(1);
    }

    if (!fs.existsSync(SCORED_PATH)) {
        console.error('resume_self_check: data/scored_vacancies.json not found');
        process.exit(1);
    }

    const scored = readJsonArray(SCORED_PATH);
    const resumeSkills = detectSkillsInText(resumeText);

    let checked = 0;
    let withMissingMandatory = 0;

    const updated = scored.map((vacancy) => {
        const apply = shouldApply(vacancy);
        const text = getVacancyText(vacancy);
        const mandatorySkills = extractMandatorySkills(text);
        const strictAzureCore = mandatorySkills.includes('azure') && mandatorySkills.includes('aks');
        const assessments = mandatorySkills.map((skill) => ({
            skill,
            assessment: classifySkillGap(skill, resumeSkills, resumeText, {
                includeDevopsAdjacency: true,
                strictAzureCore,
            }),
        }));
        const missingSkills = assessments.filter((item) => item.assessment.blocksMandatory).map((item) => item.skill);
        const transferableSkills = assessments.filter((item) => !item.assessment.blocksMandatory && item.assessment.kind !== 'direct').map((item) => item.skill);
        const comment = apply ? buildComment(missingSkills) : '';

        if (apply) {
            checked += 1;
            if (missingSkills.length > 0) withMissingMandatory += 1;
        }

        return {
            ...vacancy,
            mandatory_requirements_detected: mandatorySkills,
            soft_adjacent_missing_requirements: apply ? transferableSkills : [],
            missing_mandatory_requirements: apply ? missingSkills : [],
            resume_check_comment: comment,
            resume_self_check_passed: !apply || missingSkills.length === 0,
        };
    });

    fs.writeFileSync(SCORED_PATH, JSON.stringify(updated, null, 2));
    exportRelevantArtifacts(updated);
    console.log(`resume_self_check: checked ${checked} relevant vacancies`);
    console.log(`resume_self_check: ${withMissingMandatory} relevant vacancies have mandatory hard gaps`);
}

run();




