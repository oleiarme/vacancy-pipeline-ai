/**
 * merge_vacancies.js - merge vacancies from Glassdoor and LinkedIn.
 */

const fs = require('fs');
const path = require('path');
const { mergeVacancyRecords } = require('./lib/merge_utils');
const { getVacancyDedupKey, isPortugalVacancy } = require('./lib/vacancy_utils');

const ROOT = path.resolve(__dirname, '..');
const GD_MAIL_PATH = path.join(ROOT, 'data', 'vacancies_mail_glassdoor.json');
const GD_SCRAPE_PATH = path.join(ROOT, 'data', 'vacancies_scrape_glassdoor.json');
const LI_PATH = path.join(ROOT, 'data', 'vacancies_scrape_linkedin.json');
const MERGED_PATH = path.join(ROOT, 'data', 'vacancies.json');

function readJsonArray(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
}

(async () => {
    console.log('Starting merge process...');

    const gdMailData = readJsonArray(GD_MAIL_PATH).map((v) => ({ ...v, source: v.source || 'glassdoor' }));
    const gdScrapeData = readJsonArray(GD_SCRAPE_PATH).map((v) => ({ ...v, source: v.source || 'glassdoor' }));
    const liData = readJsonArray(LI_PATH).map((v) => ({ ...v, source: v.source || 'linkedin' }));
    const allVacancies = [...gdMailData, ...gdScrapeData, ...liData];
    const portugalOnlyVacancies = allVacancies.filter((v) => isPortugalVacancy(v));

    console.log(`Loaded ${gdMailData.length} Glassdoor mail records.`);
    console.log(`Loaded ${gdScrapeData.length} Glassdoor scrape records.`);
    console.log(`Loaded ${liData.length} LinkedIn records.`);
    console.log(`Portugal region filter: kept=${portugalOnlyVacancies.length}, skipped=${allVacancies.length - portugalOnlyVacancies.length}`);

    const uniqueMap = new Map();
    let duplicatesRemoved = 0;

    for (const vacancy of portugalOnlyVacancies) {
        const dedupKey = getVacancyDedupKey(vacancy);
        const existing = uniqueMap.get(dedupKey);

        if (!existing) {
            uniqueMap.set(dedupKey, vacancy);
            continue;
        }

        uniqueMap.set(dedupKey, mergeVacancyRecords(existing, vacancy));
        duplicatesRemoved += 1;
    }

    const merged = Array.from(uniqueMap.values());
    console.log(`Removed ${duplicatesRemoved} duplicates.`);
    console.log(`Merged total: ${merged.length} vacancies.`);

    fs.writeFileSync(MERGED_PATH, JSON.stringify(merged, null, 2));
    console.log(`Saved ${merged.length} merged vacancies to data/vacancies.json (full monitoring mode)`);
})();
