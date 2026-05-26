/**
 * orchestrator_phases.js
 */

async function phaseGlassdoor(ctx) {
    ctx.header('Phase 1a: Glassdoor Parsing');
    const report = { ok: true, issues: [] };
    
    if (ctx.runFlags.SKIP_PARSE && ctx.isRecent(ctx.paths.glassdoorDataPath)) {
        ctx.log('ok', `Skipping Glassdoor - ${ctx.paths.glassdoorDataPath} is fresh (< 30 min)`);
    } else {
        const result = ctx.runScript('parse_glassdoor_entry.js', 'parse_glassdoor_entry.js');
        if (!result.ok) {
            ctx.log('err', `Glassdoor parsing failed: ${result.error}`);
            report.issues.push({ phase: '1a', error: result.error });
        }
    }

    const check1a = ctx.selfCheckVacancies(ctx.paths.glassdoorDataPath, 'Glassdoor vacancies', ctx.log);
    report.check = check1a;
    if (!check1a.ok) check1a.issues.forEach(i => ctx.log('warn', `  ${i}`));
    
    return report;
}

async function phaseLinkedin(ctx) {
    ctx.header('Phase 1b: LinkedIn Parsing');
    const report = { ok: true, issues: [] };

    if (ctx.runFlags.SKIP_PARSE && ctx.isRecent('data/vacancies_scrape_linkedin.json')) {
        ctx.log('ok', 'Skipping LinkedIn - data/vacancies_scrape_linkedin.json is fresh (< 30 min)');
    } else {
        const result = ctx.runScript('parse_linkedin.js', 'parse_linkedin.js', [], { timeoutMs: 900_000 });
        if (!result.ok) {
            ctx.log('err', `LinkedIn parsing failed: ${result.error}`);
            report.issues.push({ phase: '1b', error: result.error });
        }
    }

    const check = ctx.selfCheckVacancies('data/vacancies_scrape_linkedin.json', 'LinkedIn vacancies', ctx.log);
    report.check = check;
    if (!check.ok) check.issues.forEach(i => ctx.log('warn', `  ${i}`));

    return report;
}

async function phaseMerge(ctx) {
    ctx.header('Phase 1c: Merging & Deduplication');
    const report = { ok: true, issues: [] };

    const mergeResult = ctx.runScript('merge_vacancies.js', 'merge_vacancies.js');
    if (!mergeResult.ok) {
        ctx.log('err', `Merge failed: ${mergeResult.error}`);
        report.issues.push({ phase: '1c', error: mergeResult.error });
        report.ok = false;
        report.fatal = true;
        return report;
    }

    const check = ctx.selfCheckVacancies('data/vacancies.json', 'Merged vacancies', ctx.log);
    report.check = check;
    if (!check.ok) {
        check.issues.forEach(i => ctx.log('warn', `  ${i}`));
    }
    return report;
}

async function phaseScoring(ctx) {
    ctx.header('Phase 2: AI Scoring');
    const report = { ok: true, issues: [] };

    if (ctx.runFlags.MANUAL_SCORE) {
        ctx.log('warn', 'MANUAL SCORE MODE: expecting pre-generated data/scored_vacancies.json');
        if (!ctx.isRecent('data/scored_vacancies.json', 60)) {
            ctx.log('warn', 'scored_vacancies.json is stale or missing.');
            report.issues.push({ phase: '2', error: 'Missing or stale scored_vacancies.json in manual mode' });
            report.ok = false;
            report.fatal = true;
            return report;
        }
        ctx.log('ok', `Using existing scored_vacancies.json.`);
    } else {
        ctx.log('info', 'Running description hydration via hydrate_descriptions.js');
        const hydrateResult = ctx.runScript('hydrate_descriptions.js', 'hydrate_descriptions.js');
        if (!hydrateResult.ok) {
            ctx.log('err', `Description hydration failed: ${hydrateResult.error}`);
            report.issues.push({ phase: '2a', error: hydrateResult.error });
            report.ok = false;
            report.fatal = true;
            return report;
        }

        ctx.log('info', 'Running automatic scoring via score_vacancies.js');
        const scoreResult = ctx.runScript('score_vacancies.js', 'score_vacancies.js');
        if (!scoreResult.ok) {
            ctx.log('err', `Scoring failed: ${scoreResult.error}`);
            report.issues.push({ phase: '2', error: scoreResult.error });
            report.ok = false;
            report.fatal = true;
            return report;
        }
    }

    const check = ctx.selfCheckScored(ctx.log);
    report.check = check;
    if (!check.ok) {
        check.issues.forEach(i => ctx.log('err', `  ${i}`));
        ctx.log('err', 'Scoring validation failed. Halting pipeline to prevent sending bad data to Telegram.');
        report.ok = false;
        report.fatal = true;
    }
    return report;
}

async function phaseResumeSelfCheck(ctx) {
    ctx.header('Phase 2b: Resume Matching Self-Check');
    const report = { ok: true, issues: [] };

    const result = ctx.runScript('resume_self_check.js', 'resume_self_check.js');
    if (!result.ok) {
        ctx.log('err', `Resume self-check failed: ${result.error}`);
        report.issues.push({ phase: '2b', error: result.error });
        report.ok = false;
        report.fatal = true;
        return report;
    }

    const check = ctx.selfCheckScored(ctx.log);
    report.check = check;
    if (!check.ok) {
        check.issues.forEach(i => ctx.log('err', `  ${i}`));
        ctx.log('err', 'Resume-vs-vacancy self-check validation failed.');
        report.ok = false;
        report.fatal = true;
    } else {
        ctx.log('ok', 'Resume-vs-vacancy self-check passed');
    }
    return report;
}

async function phaseSupabaseSync(ctx) {
    ctx.header('Phase 2.5: Supabase Sync');
    const report = { ok: true, issues: [] };

    if (!ctx.runFlags.hasSupabaseUrl) {
        ctx.log('warn', 'SUPABASE_URL not set in .env - skipping Supabase sync (not blocking)');
        return report;
    }

    const supaResult = ctx.runScript('supabase_sync.js', 'supabase_sync.js');
    if (!supaResult.ok) {
        ctx.log('warn', `Supabase sync failed (non-blocking): ${supaResult.error}`);
        report.issues.push({ phase: '2.5', error: supaResult.error, nonBlocking: true });
    } else {
        ctx.log('ok', 'Supabase sync complete');
    }
    return report;
}

async function phaseTelegram(ctx) {
    ctx.header('Phase 4: Telegram Notification');
    const report = { ok: true, issues: [] };

    if (ctx.runFlags.SKIP_TELEGRAM) {
        ctx.log('warn', 'SKIP-TELEGRAM flag set - skipping');
    } else {
        const tgResult = ctx.runScript('send_telegram.js', 'send_telegram.js');
        if (!tgResult.ok) {
            ctx.log('err', `Telegram send failed: ${tgResult.error}`);
            report.issues.push({ phase: '4', error: tgResult.error });
        } else {
            ctx.log('ok', 'Telegram messages sent and vacancies marked as sent in Supabase');
        }
    }
    return report;
}

async function phaseFinalVerify(ctx, runStamp) {
    ctx.header('Phase 5: Final Pipeline Verification');
    const report = { ok: true, issues: [] };
    
    const verificationReportPath = ctx.path.join(ctx.ROOT, 'reports', 'verification', `verify_${runStamp}.json`);
    const verifyResult = ctx.runScript('verify_pipeline.js', 'verify_pipeline.js', ['--json-out', verificationReportPath]);
    
    if (!verifyResult.ok) {
        ctx.log('err', `Final verification failed: ${verifyResult.error}`);
        report.issues.push({ phase: '5', error: verifyResult.error });
        report.ok = false;
        report.fatal = true;
    } else {
        report.artifact = ctx.path.relative(ctx.ROOT, verificationReportPath);
        ctx.log('ok', 'Final verification passed');
    }
    return report;
}

module.exports = {
    phaseGlassdoor,
    phaseLinkedin,
    phaseMerge,
    phaseScoring,
    phaseResumeSelfCheck,
    phaseSupabaseSync,
    phaseTelegram,
    phaseFinalVerify
};
