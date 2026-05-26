const { SKILL_PATTERNS, MANDATORY_MARKERS, OPTIONAL_MARKERS } = require('./skill_patterns');
const { normalizeWhitespace } = require('./text_utils');

// Backward-compatible alias — prefer normalizeWhitespace from text_utils directly.
const normalizeSpace = normalizeWhitespace;

const APPLIED_AI_TITLE_PATTERN = /(ai specialist|ai engineer|ai developer|llm engineer|genai engineer|generative ai engineer|prompt engineer|ai architect)/i;
const APPLIED_AI_GENERIC_PATTERN = /\b(ai|llm|genai|generative ai|prompt|agentic)\b/i;
const APPLIED_AI_NEGATIVE_PATTERN = /\b(trainer|training|annotat|reviewer|tester|red team|ethics|research|scientist)\b/i;

function isAppliedAiRoleTitle(title) {
    const value = normalizeSpace(title).toLowerCase();
    const hasAppliedAiSignal = APPLIED_AI_TITLE_PATTERN.test(value)
        || (APPLIED_AI_GENERIC_PATTERN.test(value) && !APPLIED_AI_NEGATIVE_PATTERN.test(value));
    return hasAppliedAiSignal;
}

const AI_CONTEXT_PATTERN = /\b(ai|llm|model|machine learning|ml)\b/i;
const TRAINING_HEAVY_TITLE_PATTERN = /\b(ai model trainer|ai trainer|trainer|annotat|reviewer|red team|research scientist|machine learning engineer|ml engineer|scientist|researcher)\b/i;
const TRAINING_HEAVY_BODY_PATTERN = /\b(fine-?tuning|deep learning|pytorch|tensorflow|annotation|annotat(?:e|ion|ing|or)|model training|train(?:ing)? models?|research datasets?|research workflows?)\b/i;
const APPLIED_AI_BODY_PATTERN = /\b(embeddings?|llm prompt engines?|prompt engineering|agentic ai|ai adoption|ai initiatives?|reusable ai modules?|autonomous reasoning|workflow orchestration|ml-?ops)\b/i;

function isTrainingHeavyAiRole(vacancy) {
    const title = normalizeSpace(vacancy && vacancy.title).toLowerCase();
    const combined = normalizeSpace([
        vacancy && vacancy.title,
        vacancy && vacancy.description,
    ].filter(Boolean).join(' ')).toLowerCase();
    const aiContext = AI_CONTEXT_PATTERN.test(combined);
    const nonTargetTitle = TRAINING_HEAVY_TITLE_PATTERN.test(title);
    const trainingHeavyBody = TRAINING_HEAVY_BODY_PATTERN.test(combined);
    const appliedAiBody = APPLIED_AI_BODY_PATTERN.test(combined);
    return aiContext && (nonTargetTitle || (trainingHeavyBody && !appliedAiBody));
}

const MANDATORY_SPLIT_RE = /[\n.;]+/;

function detectSkillsInText(text) {
    const found = new Set();
    const source = String(text || '');

    for (const item of SKILL_PATTERNS) {
        if (item.patterns.some((pattern) => pattern.test(source))) {
            found.add(item.key);
        }
    }

    return found;
}

function isMandatorySentence(sentence) {
    const text = String(sentence || '');

    if (OPTIONAL_MARKERS.some((marker) => marker.test(text))) return false;
    return MANDATORY_MARKERS.some((marker) => marker.test(text));
}

function extractMandatorySkills(vacancyText) {
    if (!vacancyText) return [];

    const sentences = String(vacancyText)
        .split(MANDATORY_SPLIT_RE)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

    const mandatorySkills = new Set();
    for (const sentence of sentences) {
        if (!isMandatorySentence(sentence)) continue;

        const found = detectSkillsInText(sentence);
        found.forEach((skill) => mandatorySkills.add(skill));
    }

    return Array.from(mandatorySkills);
}

function hasInfraShellAutomationBaseline(resumeSkills, resumeText) {
    const text = String(resumeText || '');
    const hasShell = resumeSkills.has('bash') || resumeSkills.has('linux');
    const hasAutomationCore =
        resumeSkills.has('python') ||
        resumeSkills.has('devops') ||
        resumeSkills.has('terraform') ||
        /\bautomation\b/i.test(text);

    return hasShell && hasAutomationCore;
}

function hasSqlBaseline(resumeSkills, resumeText) {
    return resumeSkills.has('sql')
        || resumeSkills.has('postgresql')
        || resumeSkills.has('mysql')
        || /\bsql\b/i.test(String(resumeText || ''));
}

function hasCiCdBaseline(resumeSkills, resumeText) {
    return resumeSkills.has('ci/cd')
        || resumeSkills.has('ansible')
        || /\bgithub actions\b/i.test(String(resumeText || ''));
}

function hasApiIntegrationBaseline(resumeSkills, resumeText) {
    const text = String(resumeText || '');
    return resumeSkills.has('api-integrations')
        || /\bapi integrations?\b/i.test(text)
        || /\bapi-heavy\b/i.test(text)
        || /\bopenai api\b/i.test(text)
        || /\banthropic\b/i.test(text)
        || /\binteractive brokers\b/i.test(text)
        || /\bpolygon\b/i.test(text)
        || /\bcboe\b/i.test(text);
}

function hasPipelineBaseline(resumeSkills, resumeText) {
    const text = String(resumeText || '');
    return resumeSkills.has('elt')
        || resumeSkills.has('data-quality')
        || /\bpipelines?\b/i.test(text)
        || /\bdata workflows?\b/i.test(text)
        || /\borchestration\b/i.test(text);
}

function hasProductionKubernetesBaseline(resumeSkills, resumeText) {
    const text = String(resumeText || '');
    const hasKubernetesSignal = resumeSkills.has('kubernetes') || /\bkubernetes\b/i.test(text) || /\bk8s\b/i.test(text);
    if (!hasKubernetesSignal) return false;

    const hasLabOnlySignal =
        /\blearning kubernetes\b/i.test(text)
        || /\blab environment\b/i.test(text)
        || /\bk3s\b/i.test(text)
        || /\bhomelab\b/i.test(text);

    const hasProductionSignal =
        /\bproduction kubernetes\b/i.test(text)
        || /\bproduction clusters?\b/i.test(text)
        || /\bkubernetes clusters?\b/i.test(text)
        || /\bon-?call\b/i.test(text)
        || /\bincident response\b/i.test(text)
        || /\b24\/7\b/i.test(text)
        || /\bdeployed?\b/i.test(text)
        || /\bdeployments?\b/i.test(text);

    return hasProductionSignal && !hasLabOnlySignal;
}

function hasAppliedAiBaseline(resumeSkills, resumeText) {
    const text = String(resumeText || '');
    return resumeSkills.has('llm')
        || resumeSkills.has('ai-agents')
        || resumeSkills.has('ai-adoption')
        || /\bopenai api\b/i.test(text)
        || /\banthropic\b/i.test(text)
        || /\bgemini\b/i.test(text)
        || /\bmistral\b/i.test(text)
        || /\bmulti-model routing\b/i.test(text)
        || /\bagentic ai\b/i.test(text)
        || /\bai engineer\b/i.test(text)
        || /\bllm\b/i.test(text);
}

function makeAssessment(kind, label, weight, blocksMandatory) {
    return { kind, label, weight, blocksMandatory };
}

function classifySkillGap(skill, resumeSkills, resumeText, options = {}) {
    const {
        includeDevopsAdjacency = false,
        strictAzureCore = false,
    } = options;

    const text = String(resumeText || '');
    const has = (name) => resumeSkills.has(name);
    const sqlBaseline = hasSqlBaseline(resumeSkills, resumeText);
    const cicdBaseline = hasCiCdBaseline(resumeSkills, resumeText);
    const apiBaseline = hasApiIntegrationBaseline(resumeSkills, resumeText);
    const pipelineBaseline = hasPipelineBaseline(resumeSkills, resumeText);
    const infraBaseline = hasInfraShellAutomationBaseline(resumeSkills, resumeText);
    const productionKubernetesBaseline = hasProductionKubernetesBaseline(resumeSkills, resumeText);
    const appliedAiBaseline = hasAppliedAiBaseline(resumeSkills, resumeText);

    if (has(skill)) return makeAssessment('direct', 'Direct match', 1, false);
    if (skill === 'sql' && sqlBaseline) return makeAssessment('direct', 'Direct match', 1, false);
    if (skill === 'api-integrations' && apiBaseline) return makeAssessment('direct', 'Direct match', 1, false);

    if (skill === 'azure' && strictAzureCore) {
        return makeAssessment('hard_gap', 'Hard gap', 0, true);
    }

    if (skill === 'devops' && includeDevopsAdjacency) {
        if (has('sre') || has('terraform') || has('ci/cd') || infraBaseline) {
            return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
        }
    }

    if (skill === 'llm' && appliedAiBaseline) {
        return makeAssessment('direct', 'Direct match', 1, false);
    }
    if (skill === 'ai-agents' && appliedAiBaseline) {
        return makeAssessment('direct', 'Direct match', 1, false);
    }
    if (skill === 'prompt-engineering' && appliedAiBaseline) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'embeddings' && (appliedAiBaseline || (has('python') && apiBaseline))) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'ai-adoption' && (appliedAiBaseline || apiBaseline)) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'mlops' && (appliedAiBaseline && (cicdBaseline || infraBaseline || has('devops')))) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'aks' && productionKubernetesBaseline) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'powershell' && infraBaseline) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'yaml' && (cicdBaseline || has('ansible') || /\byaml\b/i.test(text))) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'azure' && (has('aws') || has('gcp') || has('terraform') || has('devops'))) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'serverless' && (has('aws') || has('gcp') || has('python') || has('node.js'))) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'ci/cd' && (has('devops') || has('ansible') || /\bci\/cd\b/i.test(text) || /\bgithub actions\b/i.test(text))) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'airtable' && ((has('python') || sqlBaseline || apiBaseline || /\bexcel\b/i.test(text)) && (sqlBaseline || apiBaseline || /\bspreadsheet\b/i.test(text) || /\bexcel\b/i.test(text)))) {
        return makeAssessment('familiarizable', 'Familiarizable tool', 0.25, false);
    }
    if (skill === 'data-quality' && ((has('python') || sqlBaseline) && (cicdBaseline || pipelineBaseline || has('prometheus')))) {
        return makeAssessment('adjacent_short_ramp', 'Adjacent skill gap (short ramp)', 0.55, false);
    }
    if (skill === 'elt' && (has('python') && (sqlBaseline || has('gcp') || apiBaseline || pipelineBaseline))) {
        return makeAssessment('adjacent_ownership_ramp', 'Adjacent skill gap (ownership ramp)', 0.4, false);
    }
    if (skill === 'bigquery' && (has('gcp') && (sqlBaseline || has('python') || pipelineBaseline))) {
        return makeAssessment('adjacent_ownership_ramp', 'Adjacent skill gap (ownership ramp)', 0.4, false);
    }
    if (skill === 'dbt' && (sqlBaseline && (cicdBaseline || pipelineBaseline || has('python')))) {
        return makeAssessment('adjacent_ownership_ramp', 'Adjacent skill gap (ownership ramp)', 0.4, false);
    }
    if ((skill === 'airflow' || skill === 'astro') && (has('python') && (cicdBaseline || pipelineBaseline || infraBaseline))) {
        return makeAssessment('adjacent_ownership_ramp', 'Adjacent skill gap (ownership ramp)', 0.4, false);
    }

    return makeAssessment('hard_gap', 'Hard gap', 0, true);
}

function isSoftAdjacentMissingSkill(skill, resumeSkills, resumeText, options = {}) {
    return classifySkillGap(skill, resumeSkills, resumeText, options).kind !== 'hard_gap';
}

module.exports = {
    classifySkillGap,
    detectSkillsInText,
    extractMandatorySkills,
    hasApiIntegrationBaseline,
    hasAppliedAiBaseline,
    hasCiCdBaseline,
    hasInfraShellAutomationBaseline,
    hasPipelineBaseline,
    hasProductionKubernetesBaseline,
    hasSqlBaseline,
    isMandatorySentence,
    isSoftAdjacentMissingSkill,
    isAppliedAiRoleTitle,
    isTrainingHeavyAiRole,
    normalizeSpace,
};
