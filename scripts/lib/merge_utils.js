function countRichFields(vacancy) {
    let score = 0;
    if (vacancy && vacancy.description) score += 3;
    if (vacancy && Array.isArray(vacancy.contacts) && vacancy.contacts.length > 0) score += 2;
    if (vacancy && Array.isArray(vacancy.emails) && vacancy.emails.length > 0) score += 1;
    if (vacancy && vacancy.recruiter_name) score += 1;
    return score;
}

function mergeLinkedinMetadata(base, extra) {
    const merged = { ...base };

    if (extra.source_variant === 'notifications' || extra.linkedin_notification_signal) {
        merged.source_variant = 'notifications';
    } else if (!merged.source_variant && extra.source_variant) {
        merged.source_variant = extra.source_variant;
    }

    if (extra.linkedin_notification_signal) {
        merged.linkedin_notification_signal = true;
    }
    if (extra.linkedin_notification_type && !merged.linkedin_notification_type) {
        merged.linkedin_notification_type = extra.linkedin_notification_type;
    }
    if (extra.linkedin_notification_context) {
        merged.linkedin_notification_context = extra.linkedin_notification_context;
    }

    return merged;
}

function mergeVacancyRecords(existing, incoming) {
    const existingScore = countRichFields(existing);
    const incomingScore = countRichFields(incoming);
    const preferred = incomingScore > existingScore ? incoming : existing;
    const fallback = preferred === existing ? incoming : existing;

    const merged = { ...fallback, ...preferred };

    if (!merged.description && fallback.description) merged.description = fallback.description;
    if ((!Array.isArray(merged.contacts) || merged.contacts.length === 0) && Array.isArray(fallback.contacts) && fallback.contacts.length > 0) {
        merged.contacts = fallback.contacts;
    }
    if ((!Array.isArray(merged.emails) || merged.emails.length === 0) && Array.isArray(fallback.emails) && fallback.emails.length > 0) {
        merged.emails = fallback.emails;
    }
    if (!merged.recruiter_name && fallback.recruiter_name) {
        merged.recruiter_name = fallback.recruiter_name;
    }

    return mergeLinkedinMetadata(mergeLinkedinMetadata(merged, existing), incoming);
}

module.exports = {
    mergeVacancyRecords,
};
