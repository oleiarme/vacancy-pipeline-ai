const { normalizeWhitespace } = require('./text_utils');

const normalizeText = normalizeWhitespace;

function extractLinkedinJobIdFromHref(href) {
    const raw = normalizeText(href);
    if (!raw) return null;
    try {
        const url = new URL(raw, 'https://www.linkedin.com');
        const match = url.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?/i);
        if (match) return `li_${match[1]}`;
        const currentJobId = url.searchParams.get('currentJobId');
        if (currentJobId && /^\d+$/.test(currentJobId)) return `li_${currentJobId}`;
    } catch (_) {
        const match = raw.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?/i);
        if (match) return `li_${match[1]}`;
    }
    return null;
}

function classifyNotificationTarget(href) {
    const raw = normalizeText(href);
    if (!raw) return 'unknown';
    if (/\/jobs\/view\//i.test(raw)) return 'job_view';
    if (/linkedin\.com\/jobs\/?(?:\?|$)/i.test(raw)) return 'job_home';
    if (/\/jobs\/(search|collections|recommended|guest\/jobs)/i.test(raw)) return 'job_list';
    return 'unknown';
}

function isJobsNotificationAction(actionLabel, href) {
    const combined = `${normalizeText(actionLabel)} ${normalizeText(href)}`.toLowerCase();
    return /\/jobs\//i.test(combined) || /see job|see jobs|show all/i.test(combined);
}

function normalizeLinkedinNotificationCard(card) {
    const text = normalizeText(card && card.text);
    const posted = normalizeText(card && card.posted);
    const actionLabel = normalizeText(card && card.actionLabel);
    const href = normalizeText(card && card.href);
    const targetType = classifyNotificationTarget(href);
    const isJobNotification = targetType !== 'unknown' && isJobsNotificationAction(actionLabel, href);

    return {
        isJobNotification,
        targetType: isJobNotification ? targetType : 'unknown',
        jobId: isJobNotification && targetType === 'job_view' ? extractLinkedinJobIdFromHref(href) : null,
        href: href || null,
        sourceVariant: isJobNotification ? 'notifications' : undefined,
        linkedinNotificationSignal: isJobNotification,
        linkedinNotificationType: isJobNotification ? 'jobs_tab_new_opportunity' : undefined,
        linkedinNotificationContext: isJobNotification
            ? {
                text,
                posted,
                actionLabel,
                href,
            }
            : null,
    };
}

function applyLinkedinNotificationSignal(vacancy, normalizedNotification) {
    if (!vacancy || !normalizedNotification || !normalizedNotification.isJobNotification) return vacancy;

    return {
        ...vacancy,
        source_variant: 'notifications',
        linkedin_notification_signal: true,
        linkedin_notification_type: normalizedNotification.linkedinNotificationType,
        linkedin_notification_context: {
            text: normalizedNotification.linkedinNotificationContext.text,
            posted: normalizedNotification.linkedinNotificationContext.posted,
            action_label: normalizedNotification.linkedinNotificationContext.actionLabel,
            href: normalizedNotification.linkedinNotificationContext.href,
        },
    };
}

module.exports = {
    applyLinkedinNotificationSignal,
    classifyNotificationTarget,
    extractLinkedinJobIdFromHref,
    normalizeLinkedinNotificationCard,
};
