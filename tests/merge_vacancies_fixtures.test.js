const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeVacancyRecords } = require('../scripts/lib/merge_utils');

const searchVacancy = {
    id: 'li_4323277763',
    source: 'linkedin',
    title: 'Senior Data Engineer',
    company: 'Hostelworld Group',
    link: 'https://www.linkedin.com/jobs/view/4323277763/',
    description: 'Detailed description from search enrichment.',
    contacts: [{ type: 'hiring_team_profile', value: 'https://www.linkedin.com/in/recruiter' }],
    emails: ['hr@example.com'],
};

const notificationVacancy = {
    id: 'li_4323277763',
    source: 'linkedin',
    source_variant: 'notifications',
    title: 'Senior Data Engineer',
    company: 'Hostelworld Group',
    link: 'https://www.linkedin.com/jobs/view/4323277763/',
    linkedin_notification_signal: true,
    linkedin_notification_type: 'jobs_tab_new_opportunity',
    linkedin_notification_context: {
        text: 'SRE: ????? ????????? ??????????? ? ??????? ??????????.',
        posted: '2 ?.',
        action_label: '??. ????????',
        href: 'https://www.linkedin.com/jobs/view/4323277763/'
    }
};

test('vacancy merging logic', () => {
    const merged = mergeVacancyRecords(searchVacancy, notificationVacancy);
    assert.equal(merged.id, 'li_4323277763');
    assert.equal(merged.description, searchVacancy.description, 'description should stay from richer vacancy');
    assert.deepEqual(merged.contacts, searchVacancy.contacts, 'contacts should stay from richer vacancy');
    assert.deepEqual(merged.emails, searchVacancy.emails, 'emails should stay from richer vacancy');
    assert.equal(merged.linkedin_notification_signal, true, 'notification signal should be preserved');
    assert.equal(merged.linkedin_notification_type, 'jobs_tab_new_opportunity', 'notification type should be preserved');
    assert.deepEqual(merged.linkedin_notification_context, notificationVacancy.linkedin_notification_context, 'notification context should be preserved');
    assert.equal(merged.source_variant, 'notifications', 'notification source variant should be preserved when present');
});
