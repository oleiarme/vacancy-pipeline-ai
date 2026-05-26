/**
 * supabase_sync.js - sync scored vacancies into Supabase.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const config = require('./lib/config');
const { parseReasonsFromReasoning, normalizePosted, getPostedDays } = require('./lib/vacancy_utils');

const ROOT = config.ROOT;
const SCORED_PATH = path.join(ROOT, 'data', 'scored_vacancies.json');

async function fetchExistingStatusesByIds(supabase, ids, chunkSize = 500) {
    const existingMap = new Map();

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase
            .from('vacancies')
            .select('id, status')
            .in('id', chunk);

        if (error) {
            throw new Error(`Failed to fetch existing statuses: ${error.message}`);
        }

        (data || []).forEach((row) => existingMap.set(row.id, row.status));
    }

    return existingMap;
}

(async () => {
    try {
        const env = config.env;
        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_KEY = env.SUPABASE_KEY;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
            process.exit(1);
        }

        if (!fs.existsSync(SCORED_PATH)) {
            console.error('data/scored_vacancies.json not found');
            process.exit(1);
        }

        const scored = JSON.parse(fs.readFileSync(SCORED_PATH, 'utf8'));
        console.log(`Loaded ${scored.length} scored vacancies`);

        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const ids = scored.map((v) => v.id).filter(Boolean);
        const existingMap = ids.length > 0
            ? await fetchExistingStatusesByIds(supabase, ids)
            : new Map();

        console.log(`Found ${existingMap.size} existing matching vacancies in Supabase`);

        const now = new Date().toISOString();
        const rows = scored.map((v) => {
            const reasons = Array.isArray(v.reasons)
                ? v.reasons
                : parseReasonsFromReasoning(v.reasoning);
            const resumeComment = typeof v.resume_check_comment === 'string' ? v.resume_check_comment.trim() : '';
            const baseReasoning = v.reasoning || (reasons.length ? reasons.join(', ') : null);
            const combinedReasoning = resumeComment
                ? [baseReasoning, resumeComment].filter(Boolean).join(' | ')
                : baseReasoning;

            return {
                id: v.id,
                title: v.title || 'Untitled',
                company: v.company || 'Unknown',
                rating: v.rating || null,
                location: v.location || null,
                easy_apply: Boolean(v.easyApply),
                posted: normalizePosted(v.posted) || null,
                posted_days: Number.isFinite(v.posted_days) ? v.posted_days : getPostedDays(v.posted),
                link: v.link || '',
                source: v.source || 'glassdoor',
                score: Number.isFinite(v.score) ? v.score : 0,
                tags: Array.isArray(v.tags) ? v.tags : [],
                reasons,
                reasoning: combinedReasoning,
                relevant: typeof v.decision === 'string' ? v.decision === 'apply' : Boolean(v.relevant),
                status: existingMap.has(v.id) ? existingMap.get(v.id) : 'new',
                scraped_at: now,
                scored_at: now,
            };
        });

        const BATCH_SIZE = 50;
        let upserted = 0;
        let errors = 0;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const { data, error } = await supabase
                .from('vacancies')
                .upsert(batch, { onConflict: 'id' })
                .select('id');

            if (error) {
                console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
                errors += 1;
            } else {
                upserted += (data || []).length;
            }
        }

        const newCount = rows.filter((r) => !existingMap.has(r.id)).length;
        const updatedCount = rows.length - newCount;

        console.log('\nSupabase sync complete:');
        console.log(`  Total upserted: ${upserted}`);
        console.log(`  New vacancies: ${newCount}`);
        console.log(`  Updated: ${updatedCount}`);
        console.log(`  Errors: ${errors}`);

        const summary = {
            status: errors === 0 ? 'ok' : 'partial',
            total: upserted,
            new: newCount,
            updated: updatedCount,
            errors,
        };
        console.log(`Summary: ${JSON.stringify(summary)}`);
    } catch (error) {
        console.error('Fatal sync error:', error.message);
        process.exit(1);
    }
})();

