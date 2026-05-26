const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    detectSkillsInText,
    extractMandatorySkills,
    isSoftAdjacentMissingSkill,
    classifySkillGap,
    isAppliedAiRoleTitle,
    isTrainingHeavyAiRole,
} = require('../scripts/lib/scoring_rules');
const { hasPortugalSignal } = require('../scripts/lib/vacancy_utils');
const { scoreVacancy } = require('../scripts/score_vacancies');

const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'scoring_rules.json'), 'utf8')
);

test('mandatory skill extraction fixtures', (t) => {
    for (const fixture of fixtures.mandatorySkillCases) {
        t.test(fixture.name, () => {
            const actual = extractMandatorySkills(fixture.text).sort();
            assert.deepEqual(actual, [...fixture.expected].sort());
        });
    }
});

test('skill detection fixtures', (t) => {
    for (const fixture of fixtures.detectSkillCases) {
        t.test(fixture.name, () => {
            const actual = detectSkillsInText(fixture.text);
            for (const expected of fixture.expected || []) {
                assert.equal(actual.has(expected), true, `missing ${expected}`);
            }
            for (const absent of fixture.absent || []) {
                assert.equal(actual.has(absent), false, `should not include ${absent}`);
            }
        });
    }
});

test('gap classification fixtures', (t) => {
    for (const fixture of fixtures.gapClassificationCases) {
        t.test(fixture.name, () => {
            const actual = classifySkillGap(
                fixture.skill,
                new Set(fixture.resumeSkills),
                fixture.resumeText,
                fixture.options || {}
            );
            assert.equal(actual.kind, fixture.expectedKind);
            assert.equal(
                isSoftAdjacentMissingSkill(
                    fixture.skill,
                    new Set(fixture.resumeSkills),
                    fixture.resumeText,
                    fixture.options || {}
                ),
                fixture.softExpected,
                'soft adjacency mismatch'
            );
        });
    }
});

test('portugal signal detection fixtures', (t) => {
    for (const fixture of fixtures.portugalSignalCases) {
        t.test(fixture.name, () => {
            const actual = hasPortugalSignal(fixture.value);
            assert.equal(actual, fixture.expected);
        });
    }
});

test('AI role classification fixtures', (t) => {
    if (Array.isArray(fixtures.aiRoleCases)) {
        for (const fixture of fixtures.aiRoleCases) {
            t.test(fixture.name, () => {
                const applied = isAppliedAiRoleTitle(fixture.vacancy.title);
                assert.equal(applied, fixture.expectedAppliedAi, 'applied AI title mismatch');
                const trainingHeavy = isTrainingHeavyAiRole(fixture.vacancy);
                assert.equal(trainingHeavy, fixture.expectedTrainingHeavy, 'training-heavy mismatch');
            });
        }
    }
});

test('vacancy scoring fixtures', (t) => {
    for (const fixture of fixtures.scoreVacancyCases) {
        t.test(fixture.name, () => {
            const resumeSkills = detectSkillsInText(fixture.resumeText);
            const scored = scoreVacancy(fixture.vacancy, resumeSkills, fixture.resumeText);
            assert.equal(scored.decision, fixture.expectedDecision, 'decision mismatch');
            assert.equal(scored.relevant, fixture.expectedRelevant, 'relevance mismatch');
            if (Number.isFinite(fixture.maxScore)) {
                assert.equal(scored.score <= fixture.maxScore, true, `score should be capped at ${fixture.maxScore}`);
            }
            if (Number.isFinite(fixture.minScore)) {
                assert.equal(scored.score >= fixture.minScore, true, `score should stay above ${fixture.minScore}`);
            }
        });
    }
});
