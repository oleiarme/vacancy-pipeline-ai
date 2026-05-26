const { getArgValue, writeJsonOut } = require('./lib/verify_common');
const { runStaticChecks } = require('./verify_static');
const { runRuntimeChecks } = require('./verify_runtime');

function main() {
    const startedAt = new Date().toISOString();
    const jsonOutPath = getArgValue('--json-out');

    const staticSummary = runStaticChecks({ exitOnFailure: false, jsonOutPath: '' });
    const runtimeSummary = runRuntimeChecks({ exitOnFailure: false, jsonOutPath: '' });

    const summary = {
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: staticSummary.ok && runtimeSummary.ok,
        failures: (staticSummary.failures || 0) + (runtimeSummary.failures || 0),
        checks: [...staticSummary.checks, ...runtimeSummary.checks],
    };

    writeJsonOut(jsonOutPath, summary);

    if (!summary.ok) {
        console.error(`\nVerification failed: ${summary.failures} check(s).`);
        process.exitCode = 1;
        return summary;
    }

    console.log('\nVerification passed: all checks are green.');
    return summary;
}

if (require.main === module) {
    main();
}

