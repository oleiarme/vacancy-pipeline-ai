const fs = require('fs');
const html = fs.readFileSync('li_html.html', 'utf8');

console.log('Is logged in? ', !html.includes('authwall'));
console.log('Login elements? ', html.includes('nav__button__muted--signin') || html.includes('sign-in-form'));

// Let's find how jobs are structured
const jobMatches = html.match(/<li[^>]*>/g) || [];
console.log('Number of <li> elements:', jobMatches.length);
if (jobMatches.length > 0) {
    console.log('First few <li> classes:', jobMatches.slice(0, 10).map(tag => {
        const classMatch = tag.match(/class="([^"]+)"/);
        return classMatch ? classMatch[1] : 'No class';
    }));
}

const jobCardMatches = html.match(/class="[^"]*job-search-card[^"]*"/g) || [];
console.log('Number of job-search-card classes:', jobCardMatches.length);

const baseCardMatches = html.match(/class="[^"]*base-search-card[^"]*"/g) || [];
console.log('Number of base-search-card classes:', baseCardMatches.length);

const aLinkMatches = html.match(/class="[^"]*base-card__full-link[^"]*"/g) || [];
console.log('Number of base-card__full-link classes:', aLinkMatches.length);
