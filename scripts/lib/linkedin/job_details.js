/**
 * job_details.js
 */
const { sleep, randomDelayMs, evaluateWithNavigationRetry } = require('./utils');

function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

async function extractJobFromViewPage(page) {
    return evaluateWithNavigationRetry(page, () => {
        const pickText = (selectors) => {
            for (const selector of selectors) {
                const node = document.querySelector(selector);
                if (!node) continue;
                const text = ((node.innerText || node.textContent || '') + '').replace(/\s+/g, ' ').trim();
                if (text) return text;
            }
            return '';
        };

        const canonicalLink = window.location.href ? window.location.href.split('?')[0] : '';
        const rawTitle = pickText([
            '.job-details-jobs-unified-top-card__job-title h1',
            '.jobs-unified-top-card__job-title h1',
            'h1'
        ]);
        // LinkedIn view pages may contain "Title\nTitle with verification" — take first line
        const title = rawTitle.split('\n')[0].replace(/\s+/g, ' ').trim();
        const company = pickText([
            '.job-details-jobs-unified-top-card__company-name a',
            '.jobs-unified-top-card__company-name a',
            '.job-details-jobs-unified-top-card__company-name',
            '.jobs-unified-top-card__company-name'
        ]);
        const location = pickText([
            '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
            '.jobs-unified-top-card__subtitle-primary-grouping .tvm__text',
            '.jobs-unified-top-card__bullet'
        ]);
        const posted = pickText([
            'time',
            '.jobs-unified-top-card__subtitle-secondary-grouping .tvm__text',
            '.job-details-jobs-unified-top-card__tertiary-description-container .tvm__text'
        ]);
        const easyApply = Array.from(document.querySelectorAll('button, a')).some((node) => /easy apply/i.test((node.innerText || node.textContent || '').trim()));

        let id = '';
        try {
            const url = new URL(window.location.href);
            const match = url.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?/i);
            if (match) id = `li_${match[1]}`;
            if (!id) {
                const currentJobId = url.searchParams.get('currentJobId');
                if (currentJobId) id = `li_${currentJobId}`;
            }
        } catch (_) {
            // Ignore malformed location href.
        }

        if (!id || !title || !company || !canonicalLink || !/\/jobs\/view\/\d+/i.test(canonicalLink)) {
            return null;
        }

        const closedPatterns = [
            /no longer accepting applications/i,
            /this job is closed/i,
            /applications are closed/i,
            /this listing has expired/i,
            /no longer available for applications/i,
            /job expired/i,
            /заявки на эту вакансию больше не принимаются/i,
            /вакансия закрыта/i,
            /прием заявок прекращен/i,
            /não se aceitam mais candidaturas/i,
            /esta vaga está fechada/i,
            /candidaturas encerradas/i,
            /ya no se aceptan solicitudes/i,
            /esta oferta está cerrada/i,
            /plazo de solicitud cerrado/i
        ];
        const pageText = document.body ? document.body.innerText : '';
        const closed = closedPatterns.some((pattern) => pattern.test(pageText));

        return {
            id,
            title,
            company,
            rating: null,
            location: location || null,
            easyApply,
            posted,
            link: canonicalLink,
            source: 'linkedin',
            closed: closed || undefined,
        };
    });
}

function parseEnrichmentResults(details, job) {
    job.description = normalizeWhitespace(details.description || '');
    if (details.closed) {
        job.closed = true;
        if (!job.description) {
            job.description = '[Closed Vacancy]';
        }
    } else {
        delete job.closed;
    }
    if (Array.isArray(details.contacts) && details.contacts.length > 0) {
        job.contacts = details.contacts;
    } else {
        delete job.contacts;
    }
    if (Array.isArray(details.emails) && details.emails.length > 0) {
        job.emails = details.emails;
    } else {
        delete job.emails;
    }
    if (details.recruiterName) {
        job.recruiter_name = details.recruiterName;
    } else {
        delete job.recruiter_name;
    }
    job.enriched_at = new Date().toISOString();
}

async function enrichVacanciesWithDetails(context, jobs, options) {
    const limit = Math.min(options.limit, jobs.length);
    if (!limit) return;

    console.log(`Enriching first ${limit} vacancy card(s) with details...`);
    for (let index = 0; index < limit; index += 1) {
        const job = jobs[index];
        if (!job || !job.link) continue;

        const detailPage = await context.newPage();
        try {
            await detailPage.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
            const stayOnCardMs = randomDelayMs(2000, 5000);
            console.log(`Opened card ${index + 1}/${limit}: waiting ${stayOnCardMs}ms before reading description...`);
            await sleep(stayOnCardMs);

            const details = await evaluateWithNavigationRetry(detailPage, () => {
                const descriptionSelectors = [
                    '.jobs-description__content .jobs-box__html-content',
                    '.jobs-description__content',
                    '.jobs-box__html-content',
                    '.jobs-description-content__text',
                    '[data-test-job-description]',
                    '#expandable-text-box',
                    '[data-testid="expandable-text-box"]',
                ];

                const descCandidates = descriptionSelectors
                    .map((selector) => {
                        const el = document.querySelector(selector);
                        return el ? (el.innerText || el.textContent || '') : '';
                    })
                    .map((text) => text.replace(/\s+/g, ' ').trim())
                    .filter(Boolean);

                let description = '';
                if (descCandidates.length) {
                    description = descCandidates.sort((a, b) => b.length - a.length)[0];
                }

                const contacts = [];
                const addContact = (contact) => {
                    if (!contact || !contact.value) return;
                    const key = `${contact.type || 'unknown'}::${String(contact.value).toLowerCase()}`;
                    if (!contacts.some((c) => `${c.type || 'unknown'}::${String(c.value).toLowerCase()}` === key)) {
                        contacts.push(contact);
                    }
                };

                const hiringSectionSelectors = [
                    '[data-test-meet-the-hiring-team]',
                    '[data-test-job-poster]',
                    '.jobs-poster',
                    '.jobs-poster__container',
                    '.hirer-card__hirer-information',
                    '.job-details-people-who-can-help__connections-profile-card',
                    '[class*="job-details-people-who-can-help"]',
                ];

                const hiringSections = Array.from(document.querySelectorAll(hiringSectionSelectors.join(', ')));
                hiringSections.forEach((section) => {
                    const nameText = (
                        section.querySelector('.job-details-people-who-can-help__connections-profile-card-title strong')?.textContent ||
                        section.querySelector('h3, h2, strong')?.textContent ||
                        ''
                    ).replace(/\s+/g, ' ').trim();
                    const roleText = (
                        section.querySelector('.job-details-people-who-can-help__connections-profile-card-subtitle')?.textContent ||
                        section.querySelector('.artdeco-entity-lockup__subtitle')?.textContent ||
                        section.querySelector('p, .t-14, .t-12, span')?.textContent ||
                        ''
                    ).replace(/\s+/g, ' ').trim();
                    const canMessage = /send message|отправить сообщение|enviar mensagem|enviar mensaje/i.test(
                        (section.textContent || '').replace(/\s+/g, ' ').trim()
                    );
                    section.querySelectorAll('a[href]').forEach((a) => {
                        const hrefRaw = (a.getAttribute('href') || '').trim();
                        if (!hrefRaw) return;
                        const href = hrefRaw.startsWith('http') ? hrefRaw : new URL(hrefRaw, window.location.origin).toString();
                        if (/linkedin\.com\/in\//i.test(href)) {
                            addContact({
                                type: 'hiring_team_profile',
                                value: href,
                                name: nameText || (a.textContent || '').replace(/\s+/g, ' ').trim() || null,
                                role: roleText || null,
                                can_message: canMessage,
                                url: href,
                            });
                        }
                    });
                });

                const emailSet = new Set();
                document.querySelectorAll('a[href^=\"mailto:\"]').forEach((a) => {
                    const href = (a.getAttribute('href') || '').trim();
                    const email = href.replace(/^mailto:/i, '').trim().toLowerCase();
                    if (!email) return;
                    emailSet.add(email);
                });

                const textForEmail = [description, document.body?.innerText || ''].join('\n');
                const emailMatches = textForEmail.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
                emailMatches.forEach((email) => {
                    const e = String(email).trim().toLowerCase();
                    if (e) emailSet.add(e);
                });

                const emails = Array.from(emailSet).slice(0, 10);
                emails.forEach((email) => {
                    addContact({
                        type: 'email',
                        value: email,
                        url: `mailto:${email}`,
                    });
                });

                const recruiterName =
                    contacts.find((c) => c.type === 'hiring_team_profile' && c.name)?.name || null;

                const closedPatterns = [
                    /no longer accepting applications/i,
                    /this job is closed/i,
                    /applications are closed/i,
                    /this listing has expired/i,
                    /no longer available for applications/i,
                    /job expired/i,
                    /заявки на эту вакансию больше не принимаются/i,
                    /вакансия закрыта/i,
                    /прием заявок прекращен/i,
                    /não se aceitam mais candidaturas/i,
                    /esta vaga está fechada/i,
                    /candidaturas encerradas/i,
                    /ya no se aceptan solicitudes/i,
                    /esta oferta está cerrada/i,
                    /plazo de solicitud cerrado/i
                ];
                const pageText = document.body ? document.body.innerText : '';
                const closed = closedPatterns.some((pattern) => pattern.test(pageText));

                return {
                    description,
                    contacts,
                    emails,
                    recruiterName,
                    closed,
                };
            });

            parseEnrichmentResults(details, job);
            console.log(
                `Enriched ${index + 1}/${limit}: ${job.id} | description=${job.description.length} chars | contacts=${(job.contacts || []).length} | emails=${(job.emails || []).length}`
            );
        } catch (error) {
            console.warn(`Failed to enrich ${job.id}: ${error.message}`);
        } finally {
            await detailPage.close().catch(() => { });
        }
    }
}

module.exports = {
    extractJobFromViewPage,
    enrichVacanciesWithDetails
};
