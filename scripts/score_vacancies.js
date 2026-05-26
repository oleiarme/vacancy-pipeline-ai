const fs = require('fs');
const path = require('path');
const { normalizePosted, getPostedDays } = require('./lib/vacancy_utils');
const {
    classifySkillGap,
    detectSkillsInText,
    extractMandatorySkills,
    hasInfraShellAutomationBaseline,
    isMandatorySentence,
    isAppliedAiRoleTitle,
    isTrainingHeavyAiRole,
    normalizeSpace,
} = require('./lib/scoring_rules');

const ROOT = path.resolve(__dirname, '..');
const VACANCIES_PATH = path.join(ROOT, 'data', 'vacancies.json');
const SCORED_PATH = path.join(ROOT, 'data', 'scored_vacancies.json');
const RESUME_PATH = path.join(ROOT, 'config', 'resume.txt');

function detectExplicitRequiredStack(vacancyText) {
    const lines = String(vacancyText || '')
        .split(/[\n.;]+/)
        .map((line) => line.trim())
        .filter(Boolean);

    const required = {
        rubyRails: false,
    };

    for (const line of lines) {
        if (!isMandatorySentence(line)) continue;
        if (/\bruby\b/i.test(line) || /\bruby on rails\b/i.test(line) || /\brails\b/i.test(line) || /\bror\b/i.test(line)) {
            required.rubyRails = true;
        }
    }

    return required;
}

function summarizeAssessments(skillAssessments) {
    const groups = {
        direct: [],
        familiarizable: [],
        adjacent_short_ramp: [],
        adjacent_ownership_ramp: [],
        hard_gap: [],
    };

    for (const item of skillAssessments) {
        groups[item.assessment.kind].push(item.skill);
    }

    return groups;
}

function applyMetaClawDebate(vacancy, currentScore, matchedSkills, hardGaps, location, description) {
    const pros = [];
    const cons = [];
    let adjustment = 0;

    // Layer 1 & 2: Direct & Contextual
    if (matchedSkills.length > 5) pros.push('Strong direct skill overlap (>5 skills)');
    if (hardGaps.length === 0) pros.push('No critical mandatory gaps found');
    
    // Layer 3: Cross-Reference / Specific Filters
    const visaRequired = /visa sponsorship (is not|not available|not provided)/i.test(description);
    const languageRequired = /(fluent|native) (german|french|dutch|spanish)/i.test(description);
    const usOnly = /\bus only\b|\bbase in us\b|\bus based\b/i.test(description);
    
    if (visaRequired) cons.push('Visa sponsorship explicitly not available');
    if (languageRequired) cons.push('Specific European language (non-English) requirement detected');
    if (usOnly) cons.push('US-only residency restriction detected');

    // Layer 4: Consistency check
    const isSenior = /senior|lead|staff|principal/i.test(vacancy.title);
    if (isSenior && matchedSkills.length < 3) {
        cons.push('Senior role but low direct skill overlap');
    }

    // Synthesis
    if (cons.length > 0) {
        adjustment = -15 * cons.length;
    } else if (pros.length >= 2) {
        adjustment = 10;
    }

    return {
        finalScoreAdjustment: adjustment,
        summary: adjustment !== 0 
            ? `${adjustment > 0 ? 'Promoted' : 'Demoted'} based on ${adjustment > 0 ? pros.join(', ') : cons.join(', ')}`
            : 'No conclusive debate result',
        pros,
        cons
    };
}

function scoreVacancy(vacancy, resumeSkills, resumeText) {
    const title = normalizeSpace(vacancy.title).toLowerCase();
    const description = normalizeSpace(vacancy.description);
    const descLower = description.toLowerCase();
    const location = normalizeSpace(vacancy.location).toLowerCase();
    const rating = Number.parseFloat(vacancy.rating) || 0;

    const reasons = [];
    const tags = [];
    const vacancyText = normalizeSpace([vacancy.title, vacancy.description].join('\n'));
    const vacancySkills = Array.from(detectSkillsInText(vacancyText));
    const mandatorySkills = extractMandatorySkills(vacancyText);
    const requiredStack = detectExplicitRequiredStack(vacancyText);
    const strictAzureCore = mandatorySkills.includes('azure') && mandatorySkills.includes('aks');
    const skillAssessments = vacancySkills.map((skill) => ({
        skill,
        assessment: classifySkillGap(skill, resumeSkills, resumeText, { strictAzureCore }),
    }));
    const grouped = summarizeAssessments(skillAssessments);
    const matchedSkills = skillAssessments
        .filter((item) => item.assessment.kind === 'direct')
        .map((item) => item.skill);
    const transferableSkills = skillAssessments
        .filter((item) => item.assessment.kind !== 'direct' && item.assessment.kind !== 'hard_gap')
        .map((item) => item.skill);

    const mandatoryAssessments = mandatorySkills.map((skill) => ({
        skill,
        assessment: classifySkillGap(skill, resumeSkills, resumeText, { strictAzureCore }),
    }));
    const hasInfraDataTitleMatch = /(sre|devops|platform|site reliability|infrastructure|data engineer|data platform)/.test(title);
    const hasAppliedAiTitleMatch = isAppliedAiRoleTitle(vacancy.title);
    const trainingHeavyAiRole = isTrainingHeavyAiRole(vacancy);
    const hasRoleTitleMatch = hasInfraDataTitleMatch || (hasAppliedAiTitleMatch && !trainingHeavyAiRole);
    const effectiveMissingMandatory = mandatoryAssessments
        .filter((item) => item.assessment.blocksMandatory)
        .map((item) => item.skill);
    const transferableMandatory = mandatoryAssessments
        .filter((item) => !item.assessment.blocksMandatory && item.assessment.kind !== 'direct')
        .map((item) => item.skill);

    let score = 0;

    if (!description) {
        score += 10;
        reasons.push('+10 No description available (manual review required)');
        tags.push('missing-description');
    } else if (skillAssessments.length > 0) {
        const weightedMatch = skillAssessments.reduce((sum, item) => sum + item.assessment.weight, 0);
        const richnessFactor = Math.min(1, skillAssessments.length / 6);
        const skillScore = Math.round((weightedMatch / skillAssessments.length) * 70 * richnessFactor);
        score += skillScore;
        reasons.push(`+${skillScore} Weighted resume/role skill fit (${matchedSkills.length} direct, ${transferableSkills.length} transferable of ${skillAssessments.length})`);
    } else {
        score += 20;
        reasons.push('+20 Description has no recognizable skill markers');
    }

    if (grouped.familiarizable.length > 0) {
        reasons.push(`+0 Familiarizable tool overlap: ${grouped.familiarizable.join(', ')}`);
        tags.push('transferable-fit');
    }
    if (grouped.adjacent_short_ramp.length > 0) {
        reasons.push(`+0 Adjacent skill gap (short ramp): ${grouped.adjacent_short_ramp.join(', ')}`);
        tags.push('transferable-fit');
    }
    if (grouped.adjacent_ownership_ramp.length > 0) {
        reasons.push(`+0 Adjacent skill gap (ownership ramp): ${grouped.adjacent_ownership_ramp.join(', ')}`);
        tags.push('transferable-fit');
    }

    if (hasRoleTitleMatch) {
        score += 15;
        reasons.push('+15 Role title match');
    } else {
        reasons.push('+0 Role title mismatch');
    }

    if (/(remote|lisbon|porto|portugal)/.test(location) || /(remote|lisbon|porto|portugal)/.test(descLower)) {
        score += 5;
        reasons.push('+5 Location match');
    } else {
        reasons.push('+0 Location mismatch');
    }

    if (rating >= 4.0) {
        score += 5;
        reasons.push(`+5 Company rating (${rating})`);
    } else if (rating >= 3.0) {
        score += 3;
        reasons.push(`+3 Company rating (${rating})`);
    } else {
        reasons.push('+0 Company rating bonus');
    }

    if (effectiveMissingMandatory.length > 0) {
        const penalty = Math.min(30, effectiveMissingMandatory.length * 12);
        score -= penalty;
        reasons.push(`-${penalty} Hard gaps in mandatory skills (${effectiveMissingMandatory.join(', ')})`);
    }
    if (transferableMandatory.length > 0) {
        reasons.push(`+0 Mandatory requirements covered by transferable fit: ${transferableMandatory.join(', ')}`);
        tags.push('soft-gap-adjacent');
    }

    const hasCoreStackMismatch = requiredStack.rubyRails && !(resumeSkills.has('ruby') || resumeSkills.has('rails'));
    if (hasCoreStackMismatch) {
        score -= 20;
        tags.push('core-stack-mismatch');
        reasons.push('-20 Core stack mismatch: Ruby/Rails explicitly required');
    }

    const managementHeavy = /(team leader|people manager|people management|talent review|salary review|annual performance review|onboarding|line manager|managerial)/i.test(
        `${vacancy.title} ${vacancy.description || ''}`
    );
    const resumeIcPreference = /\b(individual contributor|ic role|senior individual contributor)\b/i.test(resumeText);
    if (managementHeavy && resumeIcPreference) {
        score -= 30;
        tags.push('role-misalignment');
        reasons.push('-30 Role misalignment (manager-heavy vacancy vs IC preference in resume)');
    }

    if (!hasInfraShellAutomationBaseline(resumeSkills, resumeText) && /(sre|devops|platform|site reliability|infrastructure|data engineer)/.test(title)) {
        tags.push('baseline-gap');
    }

    const lowConfidenceApply = score < 40 && (!hasRoleTitleMatch || matchedSkills.length === 0);
    if (trainingHeavyAiRole) {
        tags.push('non-target-ai-role');
        reasons.push('+0 Decision guard: training-heavy AI role is outside applied-AI target');
    }
    if (lowConfidenceApply) {
        tags.push('low-confidence-apply');
        reasons.push('+0 Decision guard: sub-40 score without both target-role signal and direct skill overlap');
    }

    // Advanced Verification (MetaClaw) for borderline cases
    let metaclawDebate = null;
    if (score >= 55 && score <= 75) {
        metaclawDebate = applyMetaClawDebate(vacancy, score, matchedSkills, effectiveMissingMandatory, location, descLower);
        if (metaclawDebate.finalScoreAdjustment !== 0) {
            score += metaclawDebate.finalScoreAdjustment;
            reasons.push(`${metaclawDebate.finalScoreAdjustment > 0 ? '+' : ''}${metaclawDebate.finalScoreAdjustment} MetaClaw Debate adjustment: ${metaclawDebate.summary}`);
            tags.push('metaclaw-verified');
        }
    }

    let decision = (effectiveMissingMandatory.length > 0 || hasCoreStackMismatch || trainingHeavyAiRole || lowConfidenceApply) ? 'do_not_apply_now' : 'apply';
    if (decision === 'do_not_apply_now') {
        score = Math.min(score, 39);
    }

    if (vacancy.closed === true) {
        score = 0;
        decision = 'do_not_apply_now';
        tags.push('closed-vacancy');
        reasons.push('-100 Vacancy is closed / no longer accepting applications');
    }

    score = Math.max(0, Math.min(100, score));

    const resumeComment = effectiveMissingMandatory.length
        ? `Resume self-check: mandatory requirements not found in resume -> ${effectiveMissingMandatory.join(', ')}.`
        : '';

    return {
        ...vacancy,
        posted: normalizePosted(vacancy.posted),
        posted_days: Number.isFinite(vacancy.posted_days) ? vacancy.posted_days : getPostedDays(vacancy.posted),
        score,
        tags: Array.from(new Set(tags)),
        reasons,
        reasoning: reasons.join(', '),
        decision,
        relevant: decision === 'apply',
        matched_resume_skills: matchedSkills,
        transferable_resume_skills: transferableSkills,
        detected_vacancy_skills: vacancySkills,
        mandatory_requirements_detected: mandatorySkills,
        soft_adjacent_missing_requirements: transferableMandatory,
        missing_mandatory_requirements: decision === 'apply' ? effectiveMissingMandatory : [],
        resume_check_comment: decision === 'apply' ? resumeComment : '',
        resume_self_check_passed: decision !== 'apply' || effectiveMissingMandatory.length === 0,
        skill_gap_classification: Object.fromEntries(skillAssessments.map((item) => [item.skill, item.assessment.kind])),
    };
}

function run() {
    if (!fs.existsSync(VACANCIES_PATH)) {
        console.error('data/vacancies.json not found');
        process.exit(1);
    }
    if (!fs.existsSync(RESUME_PATH)) {
        console.error('config/resume.txt not found');
        process.exit(1);
    }

    const vacancies = JSON.parse(fs.readFileSync(VACANCIES_PATH, 'utf8'));
    const resumeText = fs.readFileSync(RESUME_PATH, 'utf8');
    const resumeSkills = detectSkillsInText(resumeText);
    const scored = vacancies.map((vacancy) => scoreVacancy(vacancy, resumeSkills, resumeText));

    fs.writeFileSync(SCORED_PATH, JSON.stringify(scored, null, 2));

    const relevantCount = scored.filter((vacancy) => vacancy.relevant).length;
    const passedResumeCheck = scored.filter((vacancy) => vacancy.relevant && vacancy.resume_self_check_passed).length;
    console.log(`Scored ${scored.length} vacancies.`);
    console.log(`Found ${relevantCount} relevant vacancies.`);
    console.log(`Relevant passed resume-check: ${passedResumeCheck}`);
}

module.exports = {
    detectExplicitRequiredStack,
    run,
    scoreVacancy,
};

if (require.main === module) {
    try {
        run();
    } catch (error) {
        console.error('score_vacancies failed:', error.message);
        process.exit(1);
    }
}



