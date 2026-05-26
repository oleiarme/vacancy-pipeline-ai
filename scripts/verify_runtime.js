const path = require('path');

const {
    getArgValue,
    runCheck,
    writeJsonOut,
    buildLocationContext,
    validateLocationPolicy,
    validateLinks,
    validateNoDuplicateIds,
    toArray,
    readJson,
    ROOT,
    assert,
} = require('./lib/verify_common');

function runRuntimeChecks(options = {}) {
    const checks = [];
    let failures = 0;
    const startedAt = new Date().toISOString();
    const jsonOutPath = options.jsonOutPath !== undefined ? options.jsonOutPath : getArgValue('--json-out');
    const exitOnFailure = options.exitOnFailure !== undefined ? options.exitOnFailure : true;
    let locationSignals;
    let merged;

    const finalize = () => {
        const summary = {
            startedAt,
            finishedAt: new Date().toISOString(),
            ok: failures === 0,
            failures,
            checks,
        };
        writeJsonOut(jsonOutPath, summary);
        if (!summary.ok && exitOnFailure) {
            process.exitCode = 1;
        }
        if (summary.ok) {
            console.log('\nRuntime verification passed: all checks are green.');
        } else {
            console.error(`\nRuntime verification failed: ${summary.failures} check(s).`);
        }
        return summary;
    };

    if (!runCheck('Runtime context loads from config', () => {
        const context = buildLocationContext();
        locationSignals = context.locationSignals;
        assert(Array.isArray(locationSignals) && locationSignals.length > 0, 'config.filters.locations is empty');
    }, checks)) {
        failures += 1;
        return finalize();
    }

    if (!runCheck('Merged vacancies match location profile, valid links, and dedup by id', () => {
        merged = toArray(readJson(path.join(ROOT, 'data', 'vacancies.json'), 'data/vacancies.json'), 'data/vacancies.json');
        validateLocationPolicy('data/vacancies.json', merged, locationSignals);
        validateLinks('data/vacancies.json', merged);
        validateNoDuplicateIds(merged);
    }, checks)) failures += 1;

    if (!runCheck('Mail Glassdoor data matches location profile', () => {
        const mail = toArray(readJson(path.join(ROOT, 'data', 'vacancies_mail_glassdoor.json'), 'data/vacancies_mail_glassdoor.json'), 'data/vacancies_mail_glassdoor.json');
        validateLocationPolicy('data/vacancies_mail_glassdoor.json', mail, locationSignals);
    }, checks)) failures += 1;

    if (!runCheck('Scored vacancies are consistent', () => {
        const scored = toArray(readJson(path.join(ROOT, 'data', 'scored_vacancies.json'), 'data/scored_vacancies.json'), 'data/scored_vacancies.json');
        const badScores = scored.filter((v) => !Number.isFinite(v.score) || v.score < 0 || v.score > 100);
        if (badScores.length > 0) throw new Error(`Invalid score values: ${badScores.length}`);
        const badIds = scored.filter((v) => !String(v && v.id ? v.id : '').trim());
        if (badIds.length > 0) throw new Error(`Missing vacancy id in scored data: ${badIds.length}`);
        const badDecision = scored.filter((v) => !['apply', 'do_not_apply_now'].includes(String(v && v.decision ? v.decision : '')));
        if (badDecision.length > 0) throw new Error(`Invalid decision values: ${badDecision.length}`);
        const inconsistentRelevant = scored.filter((v) => Boolean(v.relevant) !== (v.decision === 'apply'));
        if (inconsistentRelevant.length > 0) throw new Error(`Relevant/decision mismatch: ${inconsistentRelevant.length}`);
        const uncappedRejects = scored.filter((v) => v.decision === 'do_not_apply_now' && Number(v.score) > 39);
        if (uncappedRejects.length > 0) throw new Error(`Reject decisions above score cap: ${uncappedRejects.length}`);
        validateLocationPolicy('data/scored_vacancies.json', scored, locationSignals);
        if (Array.isArray(merged) && merged.length > 0 && scored.length !== merged.length) {
            throw new Error(`scored (${scored.length}) != merged (${merged.length})`);
        }
    }, checks)) failures += 1;

    return finalize();
}

if (require.main === module) {
    runRuntimeChecks();
}

module.exports = { runRuntimeChecks };
