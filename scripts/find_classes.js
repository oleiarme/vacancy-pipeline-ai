const fs = require('fs');
const html = fs.readFileSync('li_html.html', 'utf8');

const t = html.match(/class="([^"]*location[^"]*)"/);
console.log('Location class:', t ? t[1] : 'not found');

const b = html.match(/class="([^"]*base-search-card__title[^"]*)"/);
console.log('Title class:', b ? b[1] : 'not found');

const c = html.match(/class="([^"]*base-search-card__subtitle[^"]*)"/);
console.log('Company class:', c ? c[1] : 'not found');
