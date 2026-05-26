const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const config = require('./lib/config');
const { filterIgnoredVacancies } = require('./lib/ignore_registry');
const { buildVacancyKeyboard } = require('./lib/telegram_actions');
const { extractRetryAfterSeconds, wait } = require('./lib/telegram_delivery');
const { normalizePosted, parsePostedAge } = require('./lib/vacancy_utils');
const { annotateVacanciesWithNotionPresence } = require('./lib/notion_presence');
const { escapeHtml, formatNotionVacancyLine, formatVacancyLine, selectTelegramVacancies } = require('./lib/telegram_formatting');

const ROOT = config.ROOT;
const SCORED_PATH = path.join(ROOT, 'data', 'scored_vacancies.json');
const BASE_MESSAGE_DELAY_MS = 2200;
const MAX_SEND_ATTEMPTS = 4;

const configParams = config.env;
const args = process.argv.slice(2);
const SEND_ALL_RELEVANT = args.includes('--all-relevant') || String(configParams.TELEGRAM_SEND_ALL_RELEVANT || '').toLowerCase() === 'true';
const SEND_UNDER_MIN_SCORE = args.includes('--under_min_score');

let supabase = null;
if (configParams.SUPABASE_URL && configParams.SUPABASE_KEY) {
    supabase = createClient(configParams.SUPABASE_URL, configParams.SUPABASE_KEY);
}

if (!fs.existsSync(SCORED_PATH)) {
    console.error('data/scored_vacancies.json not found');
    process.exit(1);
}

const scored = JSON.parse(fs.readFileSync(SCORED_PATH, 'utf8')).map((v) => ({
    ...v,
    posted: normalizePosted(v.posted),
}));

const botToken = configParams.TELEGRAM_BOT_TOKEN;
const URGENT_LABEL = escapeHtml('Urgent (<=5d):');
const chatId = configParams.TELEGRAM_CHAT_ID;
const topicId = configParams.TELEGRAM_TOPIC_ID;

async function fetchStatusesByIds(ids, chunkSize = 300) {
    if (!supabase) return new Map();
    const map = new Map();
    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    for (let i = 0; i < cleanIds.length; i += chunkSize) {
        const chunk = cleanIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
            .from('vacancies')
            .select('id,status')
            .in('id', chunk);
        if (error) throw new Error(`Failed to fetch statuses from Supabase: ${error.message}`);
        (data || []).forEach((row) => map.set(row.id, row.status));
    }
    return map;
}

function buildSupabaseRowFromVacancy(vacancy) {
    return {
        id: vacancy.id,
        title: vacancy.title || 'Untitled',
        company: vacancy.company || 'Unknown',
        link: vacancy.link || '',
        source: vacancy.source || 'glassdoor',
        status: 'new',
    };
}

async function ensureVacanciesExistInSupabase(vacancies, statusMap) {
    if (!supabase) return 0;
    const missing = (vacancies || []).filter((v) => v.id && !statusMap.has(v.id));
    if (missing.length === 0) return 0;

    const rows = missing.map((vacancy) => buildSupabaseRowFromVacancy(vacancy));
    const BATCH_SIZE = 50;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
            .from('vacancies')
            .upsert(batch, { onConflict: 'id' })
            .select('id');
        if (error) {
            throw new Error(`Failed to upsert missing vacancies to Supabase: ${error.message}`);
        }
        inserted += (data || []).length;
    }

    missing.forEach((v) => statusMap.set(v.id, 'new'));
    return inserted;
}

const sendMessage = async (text, replyMarkup) => {
    if (!botToken) {
        console.log('No TELEGRAM_BOT_TOKEN found in .env. Dry run:');
        console.log(text);
        return true;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = {
        chat_id: chatId,
        message_thread_id: topicId ? Number.parseInt(topicId, 10) : undefined,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
    };
    if (replyMarkup && Array.isArray(replyMarkup.inline_keyboard) && replyMarkup.inline_keyboard.length > 0) {
        body.reply_markup = replyMarkup;
    }

    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                console.log('Message sent successfully');
                return true;
            }

            const errorText = await res.text();
            const retryAfter = extractRetryAfterSeconds(errorText);
            console.error('Telegram API error:', errorText);

            if (res.status === 429 && retryAfter && attempt < MAX_SEND_ATTEMPTS) {
                const waitMs = (retryAfter * 1000) + 1000;
                console.warn(`Telegram rate limit hit. Waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_SEND_ATTEMPTS}...`);
                await wait(waitMs);
                continue;
            }

            return false;
        } catch (error) {
            console.error('Telegram send failed:', error.message);
            return false;
        }
    }

    return false;
};

const markAsSent = async (ids) => {
    if (!supabase || ids.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('vacancies')
        .update({ status: 'sent', sent_at: now })
        .in('id', ids)
        .eq('status', 'new');
    if (error) {
        console.error('Failed to mark vacancies as sent in Supabase:', error.message);
    } else {
        console.log(`Marked ${ids.length} vacancies as sent in Supabase`);
    }
};

async function sendSectionIntro(title) {
    await sendMessage(`${title}\n`);
    await wait(BASE_MESSAGE_DELAY_MS);
}

async function sendVacancySeries(rows, options = {}) {
    const { formatter, numberOffset = 0 } = options;
    const sentIds = [];
    for (let i = 0; i < rows.length; i += 1) {
        const vacancy = rows[i];
        const num = numberOffset + i + 1;
        const text = `${num}. ${formatter(vacancy)}`;
        const keyboard = buildVacancyKeyboard(vacancy, num);
        const sentOk = await sendMessage(text, keyboard);
        if (sentOk && vacancy.id) sentIds.push(vacancy.id);
        await wait(BASE_MESSAGE_DELAY_MS);
    }
    return sentIds;
}

(async () => {
    let selected = selectTelegramVacancies(scored, { underMode: SEND_UNDER_MIN_SCORE });
    const beforeIgnore = selected.length;
    selected = filterIgnoredVacancies(selected);
    const ignoredCount = beforeIgnore - selected.length;

    if (SEND_UNDER_MIN_SCORE) {
        console.warn('Sending under-min-score / non-apply / resume-check-failed vacancies from local scored file.');
    } else if (SEND_ALL_RELEVANT) {
        console.warn('Sending all apply-ready vacancies from local scored file (Supabase status filter is bypassed).');
    } else if (supabase) {
        const candidateIds = selected.map((v) => v.id).filter(Boolean);
        const statusMap = await fetchStatusesByIds(candidateIds);
        const inserted = await ensureVacanciesExistInSupabase(selected, statusMap);
        if (inserted > 0) {
            console.log(`Supabase backfill: inserted ${inserted} missing apply-ready vacancies as status='new'.`);
        }
        selected = selected.filter((v) => statusMap.get(v.id) === 'new');
        console.log(`Supabase filter applied: ${selected.length} apply-ready vacancies with status='new'.`);
    } else {
        console.warn('Supabase is not configured. Proceeding with ALL selected vacancies (no status filtering).');
    }

    if (ignoredCount > 0) {
        console.log(`Ignore registry filtered out ${ignoredCount} vacancy(s) before send.`);
    }

    selected = selected.sort((a, b) => b.score - a.score);

    let notionMatches = [];
    try {
        const annotated = await annotateVacanciesWithNotionPresence(selected);
        notionMatches = annotated.filter((v) => v.notion_found === true);
        selected = annotated.filter((v) => v.notion_found !== true);
        console.log(`Notion presence split: ${notionMatches.length} already in Notion, ${selected.length} fresh for Telegram.`);
    } catch (error) {
        console.warn(`Notion presence check failed (non-blocking): ${error.message}`);
    }

    if (selected.length === 0 && notionMatches.length === 0) {
        const date = new Date().toLocaleDateString('en-GB');
        let msg = `Vacancy AI report - ${date}\n`;
        msg += 'Glassdoor + LinkedIn | DevOps/SRE | Portugal\n\n';
        msg += SEND_UNDER_MIN_SCORE
            ? 'No under-min-score vacancies found.'
            : 'No new apply-ready vacancies found in Supabase.';
        await sendMessage(msg);
        return;
    }

    const urgent = SEND_UNDER_MIN_SCORE ? [] : selected.filter((v) => parsePostedAge(v.posted).isUrgent);
    const rest = SEND_UNDER_MIN_SCORE ? selected : selected.filter((v) => !urgent.includes(v));

    console.log(`Prepared ${selected.length} fresh vacancies to send.`);

    const date = new Date().toLocaleDateString('en-GB');
    let header = `Vacancy AI report - ${date}\n`;
    header += 'Glassdoor + LinkedIn | DevOps/SRE | Portugal\n';
    header += `Total: ${scored.length} | Fresh: ${selected.length} | Already in Notion: ${notionMatches.length} | Ignored hidden: ${ignoredCount}\n`;
    if (!SEND_UNDER_MIN_SCORE) header += `${URGENT_LABEL} ${urgent.length}\n`;
    header += '\n';
    await sendMessage(header);
    await wait(BASE_MESSAGE_DELAY_MS);

    const sentIds = [];

    if (urgent.length > 0) {
        await sendSectionIntro(`${URGENT_LABEL} ${urgent.length}`);
        sentIds.push(...await sendVacancySeries(urgent, {
            formatter: (v) => formatVacancyLine(v, false),
            numberOffset: 0,
        }));
    }

    if (rest.length > 0) {
        const title = SEND_UNDER_MIN_SCORE ? `Under-min-score vacancies: ${rest.length}` : `Relevant fresh vacancies: ${rest.length}`;
        await sendSectionIntro(title);
        sentIds.push(...await sendVacancySeries(rest, {
            formatter: (v) => formatVacancyLine(v, SEND_UNDER_MIN_SCORE),
            numberOffset: SEND_UNDER_MIN_SCORE ? 0 : urgent.length,
        }));
    }

    if (notionMatches.length > 0) {
        await sendSectionIntro(`Already in Notion: ${notionMatches.length}`);
        await sendVacancySeries(notionMatches, {
            formatter: (v) => formatNotionVacancyLine(v),
            numberOffset: 0,
        });
    }

    if (!SEND_ALL_RELEVANT && !SEND_UNDER_MIN_SCORE) {
        await markAsSent(Array.from(new Set(sentIds.filter(Boolean))));
    }
    console.log('All Telegram messages sent.');
})().catch((error) => {
    console.error('Telegram sender crashed:', error.message);
    process.exit(1);
});
