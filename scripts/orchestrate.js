/**
 * orchestrate.js - main vacancy pipeline orchestrator.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./lib/config');
const { getPostedDays } = require('./lib/vacancy_utils');
const { selfCheckVacancies, selfCheckScored } = require('./lib/orchestrator_checks');
const phases = require('./lib/orchestrator_phases');

//  FLAGS 
const args = process.argv.slice(2);
const SKIP_PARSE = args.includes('--skip-parse');
const SKIP_TELEGRAM = args.includes('--skip-telegram');
const DRY_RUN = args.includes('--dry-run');
const MANUAL_SCORE = args.includes('--manual-score');
const ROOT = path.resolve(__dirname, '..');

//  ENV / CONFIG 
const envConfig = config.env;
const glassdoorSource = String(envConfig.GLASSDOOR_SOURCE || 'web').trim().toLowerCase();
const glassdoorDataPath = glassdoorSource === 'gmail'
    ? 'data/vacancies_mail_glassdoor.json'
    : 'data/vacancies_scrape_glassdoor.json';

//  COLORS 
const c = {
    reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m',
    red: '\x1b[31m', yellow: '\x1b[33m', bold: '\x1b[1m', dim: '\x1b[2m',
};

//  HELPERS 
function log(type, msg) {
    const icons = { info: `${c.cyan}[INFO]${c.reset}`, ok: `${c.green}[OK]${c.reset}`, err: `${c.red}[ERR]${c.reset}`, warn: `${c.yellow}[WARN]${c.reset}` };
    const ts = new Date().toLocaleTimeString('en-GB');
    console.log(`${c.dim}[${ts}]${c.reset} ${icons[type] || '[INFO]'} ${msg}`);
}

function header(title) {
    console.log(`\n${c.bold}${c.cyan}${'='.repeat(60)}${c.reset}`);
    console.log(`${c.bold}  ${title}${c.reset}`);
    console.log(`${c.cyan}${'='.repeat(60)}${c.reset}\n`);
}

function readJSON(relPath) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    try { return JSON.parse(fs.readFileSync(full, 'utf8')); } catch (err) { log('warn', `Failed to read/parse ${path.relative(ROOT, full)}: ${err.message}`); return null; }
}

function isRecent(relPath, maxAgeMinutes = 30) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return false;
    const ageMs = Date.now() - fs.statSync(full).mtimeMs;
    return ageMs < maxAgeMinutes * 60 * 1000;
}

function parseTimeoutMs(value, fallback) {
    const n = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function runScript(scriptName, label, scriptArgs = [], options = {}) {
    if (DRY_RUN) {
        log('warn', `DRY-RUN: skipping ${label}`);
        return { ok: true };
    }
    log('info', `Running: ${c.bold}${label}${c.reset}`);
    const timeoutMs = parseTimeoutMs(options.timeoutMs, parseTimeoutMs(envConfig.ORCHESTRATE_STEP_TIMEOUT_MS, 300_000));
    
    const result = spawnSync('node', [path.join(ROOT, 'scripts', scriptName), ...scriptArgs], {
        encoding: 'utf8', stdio: 'inherit', cwd: ROOT, timeout: timeoutMs,
    });
    
    if (result.status !== 0 || result.error) {
        if (result.error && result.error.code === 'ETIMEDOUT') {
            return { ok: false, error: `spawnSync node ETIMEDOUT (step timeout ${timeoutMs}ms).` };
        }
        return { ok: false, error: result.error?.message || `Exit code ${result.status}` };
    }
    return { ok: true };
}

function makeRunStamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function ensureDirFor(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeSessionNotesFile(filePath, payload) {
    const issues = Array.isArray(payload.issues) ? payload.issues : [];
    const issueText = issues.length === 0
        ? '- none'
        : issues.map((i, idx) => `${idx + 1}. [Phase ${i.phase}] ${i.error}`).join('\n');
    
    const md = [
        `# Session Notes - ${payload.runStamp}`, '', '## Summary',
        `- Started: ${payload.startedAt}`, `- Finished: ${payload.finishedAt}`, `- Elapsed: ${payload.elapsedSec}s`,
        `- Merged vacancies: ${payload.mergedCount}`, `- Relevant (decision=apply): ${payload.relevantCount}`,
        `- Urgent (<=5d): ${payload.urgentCount}`, `- Source split: glassdoor=${payload.bySource.glassdoor}, linkedin=${payload.bySource.linkedin}`,
        '', '## Artifacts',
        `- Pipeline report: ${payload.pipelineReportPath}`, `- Verification report: ${payload.verificationReportPath}`, `- Vacancy report: ${payload.vacancyReportPath}`,
        '', '## Issues', issueText, ''
    ].join('\n');
    
    ensureDirFor(filePath);
    fs.writeFileSync(filePath, md);
}

function generateReport(all, relevant, urgent, bySource, k8sCount) {
    const date = new Date().toLocaleString('en-GB');
    let md = `# Vacancy Report - ${date}\n\n`;

    md += `## Legend\nKubernetes | K8S required (penalized) | Borderline exp | Staff risk\n\n`;
    md += `## Statistics\n| Metric | Value |\n|--------|-------|\n`;
    md += `| Total vacancies | ${all.length} |\n| Relevant (decision=apply) | ${relevant.length} |\n`;
    md += `| Urgent (<=5d) | ${urgent.length} |\n| K8S-focused | ${k8sCount} |\n`;
    md += `| From Glassdoor | ${bySource.glassdoor} |\n| From LinkedIn | ${bySource.linkedin} |\n\n`;

    if (urgent.length > 0) {
        md += `## Urgent Vacancies (<=5d)\n\n`;
        md += `| Score | Tags | Src | Position | Company | Rating | Location | EA | Posted | Days |\n`;
        md += `|-------|------|-----|----------|---------|--------|----------|----|--------|------|\n`;
        urgent.forEach(v => {
            const src = v.source === 'linkedin' ? 'LI' : 'GD';
            const tags = (v.tags || []).join(' ');
            const ea = v.easyApply ? 'EA' : '';
            const days = Number.isFinite(v.posted_days) ? v.posted_days : getPostedDays(v.posted);
            md += `| ${v.score}% | ${tags} | ${src} | [${v.title}](${v.link}) | ${v.company} | ${v.rating || '-'} | ${v.location || '-'} | ${ea} | ${v.posted} | ${Number.isFinite(days) ? days : '-'} |\n`;
        });
        md += '\n';
    }

    md += `## All Relevant Vacancies (decision=apply)\n\n`;
    md += `| Score | Tags | Src | Position | Company | Rating | Location | EA | Posted | Days |\n`;
    md += `|-------|------|-----|----------|---------|--------|----------|----|--------|------|\n`;
    const sorted = [...relevant].sort((a, b) => b.score - a.score);
    sorted.forEach(v => {
        const src = v.source === 'linkedin' ? 'LI' : 'GD';
        const tags = (v.tags || []).join(' ');
        const ea = v.easyApply ? 'EA' : '';
        const days = Number.isFinite(v.posted_days) ? v.posted_days : getPostedDays(v.posted);
        md += `| ${v.score}% | ${tags} | ${src} | [${v.title}](${v.link}) | ${v.company} | ${v.rating || '-'} | ${v.location || '-'} | ${ea} | ${v.posted} | ${Number.isFinite(days) ? days : '-'} |\n`;
    });

    return md;
}

//  MAIN PIPELINE 
async function main() {
    const startTime = Date.now();
    const runStamp = makeRunStamp();
    const report = { phases: {}, issues: [], startedAt: new Date().toISOString(), runStamp };

    header('Vacancy Pipeline Orchestrator');
    if (DRY_RUN) log('warn', 'DRY-RUN MODE - no files will be changed');
    if (SKIP_PARSE) log('warn', 'SKIP-PARSE - reusing existing vacancy data');

    const ctx = {
        ROOT, path, log, header, isRecent, readJSON, runScript, makeRunStamp,
        selfCheckVacancies, selfCheckScored,
        runFlags: { SKIP_PARSE, SKIP_TELEGRAM, DRY_RUN, MANUAL_SCORE, hasSupabaseUrl: Boolean(envConfig.SUPABASE_URL && envConfig.SUPABASE_KEY) },
        paths: { glassdoorDataPath }
    };

    const phaseRunners = [
        { id: '1a', fn: phases.phaseGlassdoor },
        { id: '1b', fn: phases.phaseLinkedin },
        { id: '1c', fn: phases.phaseMerge },
        { id: '2',  fn: phases.phaseScoring },
        { id: '2b', fn: phases.phaseResumeSelfCheck },
        { id: '2.5', fn: phases.phaseSupabaseSync },
        // Phase 3 is report generation inline
        { id: '4', fn: phases.phaseTelegram },
        { id: '5', fn: phases.phaseFinalVerify }
    ];

    let mergedCount = 0;
    
    for (const phase of phaseRunners) {
        if (phase.id === '4') {
            // Phase 3 generation happens before Telegram
            header('Phase 3: Generating Report');
            const scoredData = readJSON('data/scored_vacancies.json') || [];
            const relevant = scoredData.filter(v => v.relevant === true);
            const urgent = relevant.filter(v => {
                const days = Number.isFinite(v.posted_days) ? v.posted_days : getPostedDays(v.posted);
                return Number.isFinite(days) && days <= 5;
            });
            const bySource = { glassdoor: scoredData.filter(v => v.source === 'glassdoor').length, linkedin: scoredData.filter(v => v.source === 'linkedin').length };
            const k8s = relevant.filter(v => v.tags && v.tags.some(t => String(t).includes('k8s'))).length;
            
            ctx.reportStats = { scoredData, relevant, urgent, bySource, k8s };
            
            const reportMd = generateReport(scoredData, relevant, urgent, bySource, k8s);
            const reportPath = path.join(ROOT, 'reports', 'vacancies_report.md');
            ensureDirFor(reportPath);
            fs.writeFileSync(reportPath, reportMd);
            log('ok', `Report saved: reports/vacancies_report.md`);
            report.phases['3'] = { ok: true, reportPath };
        }
        
        let result;
        if (phase.id === '5') {
            result = await phase.fn(ctx, runStamp);
        } else {
            result = await phase.fn(ctx);
        }
        
        report.phases[phase.id] = result;
        if (result.issues) report.issues.push(...result.issues);
        
        if (phase.id === '1c') mergedCount = result.check?.count || 0;
        
        if (result.fatal) {
            log('err', `Phase ${phase.id} triggered a fatal abort.`);
            break;
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    report.finishedAt = new Date().toISOString();
    report.elapsedSec = elapsed;

    const stats = ctx.reportStats || { relevant: [], urgent: [], bySource: { glassdoor: 0, linkedin: 0 }, k8s: 0 };
    
    header('Pipeline Complete');
    console.log(`${c.bold}Summary:${c.reset}`);
    console.log(`  Total vacancies (merged): ${c.bold}${mergedCount}${c.reset}`);
    console.log(`  Relevant (decision=apply): ${c.bold}${stats.relevant.length}${c.reset}`);
    console.log(`  Urgent (<=5d):           ${c.bold}${stats.urgent.length}${c.reset}`);
    console.log(`  K8S-focused:              ${c.bold}${stats.k8s}${c.reset}`);
    console.log(`  From Glassdoor:           ${c.bold}${stats.bySource.glassdoor}${c.reset}`);
    console.log(`  From LinkedIn:            ${c.bold}${stats.bySource.linkedin}${c.reset}`);
    console.log(`  Issues found:             ${report.issues.length > 0 ? c.red + report.issues.length + c.reset : c.green + '0' + c.reset}`);
    console.log(`  Elapsed:                  ${c.bold}${elapsed}s${c.reset}`);
    console.log(`  Report:                   ${c.dim}reports/vacancies_report.md${c.reset}`);

    if (report.issues.length > 0) {
        console.log(`\n${c.yellow}Issues encountered:${c.reset}`);
        report.issues.forEach((i, idx) => console.log(`  ${idx + 1}. [Phase ${i.phase}] ${i.error}`));
    }

    const lastRunReportPath = path.join(ROOT, 'data', 'last_run.json');
    const runHistoryReportPath = path.join(ROOT, 'data', 'runs', `run_${runStamp}.json`);
    const sessionNotesPath = path.join(ROOT, 'reports', 'session_notes', `session_${runStamp}.md`);
    const verificationReportPathRel = report.phases['5']?.artifact || path.join('reports', 'verification', `verify_${runStamp}.json`);

    ensureDirFor(lastRunReportPath);
    ensureDirFor(runHistoryReportPath);
    fs.writeFileSync(lastRunReportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(runHistoryReportPath, JSON.stringify(report, null, 2));
    
    writeSessionNotesFile(sessionNotesPath, {
        runStamp, startedAt: report.startedAt, finishedAt: report.finishedAt, elapsedSec: report.elapsedSec,
        mergedCount, relevantCount: stats.relevant.length, urgentCount: stats.urgent.length, bySource: stats.bySource,
        issues: report.issues,
        pipelineReportPath: path.relative(ROOT, runHistoryReportPath),
        verificationReportPath: verificationReportPathRel,
        vacancyReportPath: path.relative(ROOT, report.phases['3']?.reportPath || 'reports/vacancies_report.md'),
    });

    log('ok', `Run report saved to ${path.relative(ROOT, lastRunReportPath)}`);
    log('ok', `Session notes saved to ${path.relative(ROOT, sessionNotesPath)}`);
}

main().catch(err => {
    console.error(`\n${c.red}${c.bold}Fatal error:${c.reset}`, err);
    process.exit(1);
});
