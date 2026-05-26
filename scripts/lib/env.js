const fs = require('fs');
const path = require('path');

function loadEnvFile(envPath) {
    const values = {};
    if (!envPath) return values;

    let targetPath = envPath;
    if (!fs.existsSync(targetPath)) {
        const fallbackPath = path.resolve(path.dirname(targetPath), '..', '.env');
        if (fs.existsSync(fallbackPath)) {
            targetPath = fallbackPath;
        } else {
            return values;
        }
    }

    try {
        const content = fs.readFileSync(targetPath, 'utf8');
        // Handle \r\n, \r, and \n by split on any regex newline boundary
        const lines = content.split(/\r?\n/);

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;

            const key = trimmed.slice(0, eqIndex).trim();
            const valueRaw = trimmed.slice(eqIndex + 1).trim();
            
            // Further strip surrounding quotes if they exist
            let value = valueRaw;
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            if (key) {
                values[key] = value.trim();
            }
        }
    } catch (err) {
        console.error(`Error reading .env file at ${targetPath}:`, err.message);
    }

    return values;
}

module.exports = { loadEnvFile };
