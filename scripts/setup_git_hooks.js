const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function runGit(args) {
    return spawnSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
    });
}

function main() {
    const probe = runGit(['rev-parse', '--git-dir']);
    if (probe.status !== 0) {
        console.error('setup:hooks failed: this directory is not a git repository.');
        process.exitCode = 1;
        return;
    }

    const setHooksPath = runGit(['config', 'core.hooksPath', '.githooks']);
    if (setHooksPath.status !== 0) {
        const errorText = String(setHooksPath.stderr || setHooksPath.stdout || '').trim();
        console.error(`setup:hooks failed: ${errorText || 'git config error'}`);
        process.exitCode = 1;
        return;
    }

    console.log('Git hooks path configured: .githooks');
    console.log('Pre-commit hook enabled: .githooks/pre-commit');
}

main();
