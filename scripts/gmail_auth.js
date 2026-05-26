/**
 * gmail_auth.js - get and store Gmail OAuth tokens for API access.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL, URLSearchParams } = require('url');
const config = require('./lib/config');

const ROOT = config.ROOT;
const TOKEN_PATH = config.GMAIL_TOKEN_PATH;

const env = config.env;
const CLIENT_ID = String(env.GMAIL_CLIENT_ID || '').trim();
const CLIENT_SECRET = String(env.GMAIL_CLIENT_SECRET || '').trim();
const REDIRECT_URI = String(env.GMAIL_REDIRECT_URI || 'http://127.0.0.1:53682/oauth2callback').trim();
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

function ensureEnv() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env');
    }
}

function parseRedirectUri(uri) {
    const u = new URL(uri);
    return {
        hostname: u.hostname,
        port: Number.parseInt(u.port || '80', 10),
        pathname: u.pathname || '/',
    };
}

async function exchangeCodeForToken(code) {
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange failed: ${text}`);
    }

    return response.json();
}

(async () => {
    try {
        ensureEnv();
        const redirect = parseRedirectUri(REDIRECT_URI);

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', SCOPE);
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('include_granted_scopes', 'true');

        console.log('Open this URL in your regular Chrome and approve access:');
        console.log(authUrl.toString());
        console.log('');
        console.log(`Waiting for OAuth callback on ${REDIRECT_URI} ...`);

        const code = await new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                try {
                    const reqUrl = new URL(req.url, REDIRECT_URI);
                    if (reqUrl.pathname !== redirect.pathname) {
                        res.statusCode = 404;
                        res.end('Not found');
                        return;
                    }

                    const oauthCode = reqUrl.searchParams.get('code');
                    const error = reqUrl.searchParams.get('error');

                    if (error) {
                        res.statusCode = 400;
                        res.end(`OAuth error: ${error}`);
                        server.close();
                        reject(new Error(`OAuth error: ${error}`));
                        return;
                    }

                    if (!oauthCode) {
                        res.statusCode = 400;
                        res.end('Missing code');
                        return;
                    }

                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end('<h2>Gmail auth complete. You can close this tab.</h2>');
                    server.close();
                    resolve(oauthCode);
                } catch (e) {
                    server.close();
                    reject(e);
                }
            });

            server.on('error', (e) => reject(e));
            server.listen(redirect.port, redirect.hostname);
        });

        const token = await exchangeCodeForToken(code);
        fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
        fs.writeFileSync(TOKEN_PATH, JSON.stringify({
            ...token,
            created_at: Date.now(),
        }, null, 2));

        console.log(`Saved Gmail token: ${TOKEN_PATH}`);
        console.log('Now you can run: npm run run:glassdoor:gmail');
    } catch (error) {
        console.error('gmail_auth failed:', error.message);
        process.exitCode = 1;
    }
})();
