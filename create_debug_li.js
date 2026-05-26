const fs = require('fs');

const code = fs.readFileSync('scripts/parse_linkedin.js', 'utf8');

const updatedCode = code.replace(
    /const canonicalLink = href \? href\.split\('\?'\)\[0\] : '';\s*if \(!titleText \|\| !companyText \|\| !canonicalLink \|\| !\\\/jobs\\\/view\\\/\\d\+\/i\.test\(canonicalLink\)\) \{\s*return;\s*\}/,
    `
                    let canonicalLink = href ? href.split('?')[0] : '';
                    if (!/\\/jobs\\/view\\/\\d+/i.test(canonicalLink) && id) {
                        const numId = id.replace('li_', '');
                        if (numId) canonicalLink = \`https://www.linkedin.com/jobs/view/\${numId}/\`;
                    }
                    if (!titleText || !companyText || !canonicalLink || !/\\/jobs\\/view\\/\\d+/i.test(canonicalLink)) {
                        console.log('DROPPED', { id, titleText, companyText, canonicalLink, href });
                        return;
                    }
    `
);

fs.writeFileSync('scripts/parse_linkedin_test.js', updatedCode);
console.log('Test file created.');
