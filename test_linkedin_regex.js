const { getPostedDays, hasPortugalSignal, isPortugalVacancy, normalizePosted } = require('./scripts/lib/vacancy_utils');

function postedToHours(postedValue) {
    const posted = normalizePosted(postedValue).toLowerCase();
    if (!posted) return null;

    if (/(just\s*posted|today|yesterday|right\s*now|few\s+minutes|moments?\s+ago|new\s+today|<\s*1\s*d|сегодня|вчера)/i.test(posted)) {
        return /(yesterday|вчера)/i.test(posted) ? 24 : 0;
    }

    // Support absolute timestamps from <time datetime="..."> if present.
    const absoluteMs = Date.parse(posted);
    if (Number.isFinite(absoluteMs)) {
        const deltaHours = (Date.now() - absoluteMs) / (1000 * 60 * 60);
        if (Number.isFinite(deltaHours) && deltaHours >= 0) return deltaHours;
    }

    let match = posted.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|минут\S*)/i);
    if (match) return Number.parseFloat(match[1]) / 60;

    match = posted.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|час\S*)/i);
    if (match) return Number.parseFloat(match[1]);

    match = posted.match(/(\d+(?:\.\d+)?)\s*(d|day|days|дн\S*|день|дня)/i);
    if (match) return Number.parseFloat(match[1]) * 24;

    match = posted.match(/(\d+(?:\.\d+)?)\s*(w|week|weeks|недел\S*)/i);
    if (match) return Number.parseFloat(match[1]) * 24 * 7;

    match = posted.match(/(\d+(?:\.\d+)?)\s*(mo|month|months|месяц\S*)/i);
    if (match) return Number.parseFloat(match[1]) * 24 * 30;

    match = posted.match(/(\d+(?:\.\d+)?)([hdwmчднм])/i);
    if (match) {
        const value = Number.parseFloat(match[1]);
        const unit = String(match[2]).toLowerCase();
        if (!Number.isFinite(value)) return null;
        if (unit === 'h' || unit === 'ч') return value;
        if (unit === 'd' || unit === 'д') return value * 24;
        if (unit === 'w' || unit === 'н') return value * 24 * 7;
        if (unit === 'm' || unit === 'м') return value / 60;
    }

    return null;
}

const cardText = 'Mid-Level AI Engineer Португалия · 15 минут назад · 27 кандидатов Продвигается нанимающей компанией · Статистика по ответу пока недоступна Удаленная работа Полный рабочий день 2 из 2 соответствующих навыков Простая подача заявки Сохранить';

const match = cardText.match(
    /(just posted|just now|today|yesterday|сегодня|вчера|<\s*1\s*d|\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s*ago|\d+(?:\.\d+)?\s*(?:минут\S*|час\S*|дн\S*|день|дня|недел\S*|месяц\S*)\s*назад|reposted\s+\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s*ago|размещена\s+повторно:?\s*\d+(?:\.\d+)?\s*(?:минут\S*|час\S*|дн\S*|день|дня|недел\S*|месяц\S*)\s*назад)/i
);

let res = String(match ? match[1] : '').trim();
res = res.replace(/^(?:reposted|размещена\s+повторно:?)\s+/i, '');

console.log("Date Extracted:", res);
console.log("Hours:", postedToHours(res));

