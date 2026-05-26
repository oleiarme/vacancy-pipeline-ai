# Design: Closed Vacancy Detection & Filtering

## Goal
Prevent closed/expired vacancies (e.g. from LinkedIn, Glassdoor) from being scored as active/relevant and sent to Telegram.

## Requirements
1. Detect closed vacancy pages based on page-level body text matches in multiple languages (English, Russian, Portuguese, Spanish).
2. Set `closed: true` on the vacancy details during both initial scraping (card detail enrichment) and subsequent description hydration.
3. Update the vacancy scoring engine to override any closed vacancy to `decision = 'do_not_apply_now'`, `relevant = false`, `score = 0`, and attach a `'closed-vacancy'` tag.
4. Support Glassdoor-specific expired message patterns like "no longer available for applications" and "job expired".

## Proposed Closed Vacancy Regex Patterns
```javascript
const CLOSED_PATTERNS = [
    // English
    /no longer accepting applications/i,
    /this job is closed/i,
    /applications are closed/i,
    /this listing has expired/i,
    /no longer available for applications/i,
    /job expired/i,
    
    // Russian
    /заявки на эту вакансию больше не принимаются/i,
    /вакансия закрыта/i,
    /прием заявок прекращен/i,
    
    // Portuguese
    /não se aceitam mais candidaturas/i,
    /esta vaga está fechada/i,
    /candidaturas encerradas/i,
    
    // Spanish
    /ya no se aceptan solicitudes/i,
    /esta oferta está cerrada/i,
    /plazo de solicitud cerrado/i
];
```

## Integration Points

### 1. `scripts/lib/linkedin/job_details.js`
In `extractJobFromViewPage(page)` (if page is a full view page) or in `enrichVacanciesWithDetails`' evaluate block:
Add checking `document.body.innerText` against the patterns.
If a match is found:
- Return `closed: true` alongside other extracted properties.
In `parseEnrichmentResults(details, job)`:
- Save `job.closed = Boolean(details.closed);`

### 2. `scripts/hydrate_descriptions.js`
In `hydrateMissingDescriptions`:
In the page extraction logic, perform:
```javascript
const isClosed = await page.evaluate((patterns) => {
    const text = document.body.innerText || '';
    return patterns.some(pattern => new RegExp(pattern.source, pattern.flags).test(text));
}, CLOSED_PATTERNS.map(p => ({ source: p.source, flags: p.flags })));
```
If `isClosed` is true, set `vacancy.closed = true`.

### 3. `scripts/score_vacancies.js`
In `scoreVacancy(vacancy, resumeSkills, resumeText)`:
If `vacancy.closed === true`:
- Set `score = 0`.
- Set `decision = 'do_not_apply_now'`.
- Set `relevant = false`.
- Add reason: `'-100 Vacancy is closed / no longer accepting applications'`.
- Add tag: `'closed-vacancy'`.

## Verification Plan
1. Test code syntax using static tests (`npm run verify:static`).
2. Add unit/integration tests matching closed vacancies to verify they score as 0 and are marked `do_not_apply_now`.
3. Manually check and score the target Cloudflare job `li_4358868720` to verify it gets correctly filtered out.
