const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    normalizeLinkedinNotificationCard,
    applyLinkedinNotificationSignal,
} = require('../scripts/lib/linkedin_notifications');

const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'linkedin_notifications.json'), 'utf8')
);

test('linkedin notifications processing', (t) => {
    t.test('notification card normalization', (t2) => {
        for (const fixture of fixtures.notificationCards) {
            t2.test(fixture.name, () => {
                const normalized = normalizeLinkedinNotificationCard(fixture.card);
                assert.equal(normalized.isJobNotification, fixture.expected.isJobNotification, 'job classification');
                assert.equal(normalized.targetType, fixture.expected.targetType, 'target type');
                assert.equal(normalized.jobId || null, fixture.expected.jobId, 'job id');

                if (fixture.expected.isJobNotification) {
                    assert.equal(normalized.sourceVariant, fixture.expected.sourceVariant, 'source variant');
                    assert.equal(normalized.linkedinNotificationSignal, fixture.expected.signal, 'signal flag');
                    assert.equal(normalized.linkedinNotificationType, fixture.expected.signalType, 'signal type');
                    assert.equal(Boolean(normalized.linkedinNotificationContext), true, 'notification context missing');
                    assert.equal(normalized.linkedinNotificationContext.actionLabel, fixture.card.actionLabel, 'action label');
                    assert.equal(normalized.linkedinNotificationContext.posted, fixture.card.posted, 'posted text');
                    assert.equal(normalized.linkedinNotificationContext.text, fixture.card.text, 'raw text');
                }
            });
        }
    });

    t.test('apply notification signals to vacancy', () => {
        const vacancy = {
            id: 'li_4323277763',
            title: 'Senior Data Engineer',
            company: 'Hostelworld Group',
            link: 'https://www.linkedin.com/jobs/view/4323277763/',
            source: 'linkedin',
        };
        const enriched = applyLinkedinNotificationSignal(
            vacancy,
            normalizeLinkedinNotificationCard(fixtures.notificationCards[0].card)
        );
        assert.equal(enriched.source_variant, 'notifications');
        assert.equal(enriched.linkedin_notification_signal, true);
        assert.equal(enriched.linkedin_notification_type, 'jobs_tab_new_opportunity');
        assert.deepEqual(enriched.linkedin_notification_context, {
            text: fixtures.notificationCards[0].card.text,
            posted: fixtures.notificationCards[0].card.posted,
            action_label: fixtures.notificationCards[0].card.actionLabel,
            href: fixtures.notificationCards[0].card.href,
        });
    });
});
