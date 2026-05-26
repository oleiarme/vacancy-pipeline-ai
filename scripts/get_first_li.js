const fs = require('fs');
const html = fs.readFileSync('li_html.html', 'utf8');

const listMatch = html.match(/<ul class="jobs-search__results-list">([\s\S]*?)<\/ul>/);
if (listMatch) {
    const listHtml = listMatch[1];
    const liMatch = listHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/);
    if (liMatch) {
        console.log("First li content:");
        console.log(liMatch[1]);
    } else {
        console.log("no li found");
    }
} else {
    console.log("no ul found");
}
