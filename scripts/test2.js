const fs = require('fs');
const html = fs.readFileSync('li_html.html', 'utf8');

const t = html.match(/base-search-card__title/g);
console.log('Title base-search-card__title count:', t ? t.length : 0);

const s = html.match(/base-search-card__subtitle/g);
console.log('Subtitle base-search-card__subtitle count:', s ? s.length : 0);

const sr_title = html.match(/sr-only/g);
console.log('sr-only count:', sr_title ? sr_title.length : 0);
