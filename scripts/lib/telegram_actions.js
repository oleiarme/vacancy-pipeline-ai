function buildIgnoreCallbackData(vacancyId) {
    const id = String(vacancyId || '').trim();
    if (!id) throw new Error('vacancyId is required for ignore callback');
    return `ignore:${id}`;
}

function buildNotionCreateCallbackData(vacancyId) {
    const id = String(vacancyId || '').trim();
    if (!id) throw new Error('vacancyId is required for notion create callback');
    return `notion_create:${id}`;
}

function buildVacancyKeyboard(vacancy, reportNumber) {
    const row = [];
    if (vacancy && vacancy.id) {
        row.push({
            text: `Ignore #${reportNumber}`,
            callback_data: buildIgnoreCallbackData(vacancy.id),
        });
    }

    if (vacancy && vacancy.notion_found && vacancy.notion_page_url) {
        row.push({
            text: 'Open in Notion',
            url: String(vacancy.notion_page_url).trim(),
        });
    } else if (vacancy && vacancy.id) {
        row.push({
            text: 'Create in Notion',
            callback_data: buildNotionCreateCallbackData(vacancy.id),
        });
    }

    return row.length > 0 ? { inline_keyboard: [row] } : { inline_keyboard: [] };
}

module.exports = {
    buildIgnoreCallbackData,
    buildNotionCreateCallbackData,
    buildVacancyKeyboard,
};
