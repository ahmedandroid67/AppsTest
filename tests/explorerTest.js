const { chromium } = require('playwright');
const { getLinks } = require('../engine/explorer');
const { clickButtons } = require('../engine/actions');
const { measureLoad } = require('../engine/analyzer');

// ✅ BLOCKED PAGES / PATTERNS
const BLOCKED_URLS = [
    '/Medicaments'
];

// ✅ Check if URL is blocked
function isBlocked(url) {
    return (
        BLOCKED_URLS.some(blocked => url.includes(blocked)) ||
        url.includes('Export') ||
        url.includes('handler=Export') ||
        url.endsWith('.pdf') ||
        url.endsWith('.xlsx')
    );
}

// ✅ Normalize URLs (remove query params like ?id=123)
function normalizeUrl(url) {
    return url.split('?')[0];
}

// 🔐 Detect if user is logged out
async function isLoggedOut(page) {
    return await page.$('#Input_Email') !== null;
}

// 🔐 Perform login
async function login(page) {
    await page.goto('https://medisys.laaraichi.com/');

    await page.fill('#Input_Email', 'medecin@gmail.com');
    await page.fill('#Input_Password', 'admin123');

    await page.click('button[type=submit]');
    await page.waitForLoadState('networkidle');

    console.log('✅ Logged in');
}

async function run() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    // ✅ Initial login
    await login(page);

    const toVisit = ['https://medisys.laaraichi.com/'];
    const visited = new Set();

    while (toVisit.length > 0) {
        const url = toVisit.shift();
        const normalizedUrl = normalizeUrl(url);

        // ⛔ Skip blocked
        if (isBlocked(url)) {
            console.log('⛔ Skipping blocked:', url);
            continue;
        }

        // ⛔ Skip visited
        if (visited.has(normalizedUrl)) continue;

        console.log('🌐 Visiting:', url);
        visited.add(normalizedUrl);

        // ✅ Measure + navigate (ONLY ONCE)
        let loadTime;
        try {
            loadTime = await measureLoad(page, url);
        } catch (err) {
            console.log('❌ Failed to load:', url);
            continue;
        }

        if (loadTime === -1) {
            console.log('❌ Failed to load:', url);
            continue;
        }

        console.log('⏱️ Load time:', loadTime, 'ms');

        if (loadTime > 5000) {
            console.log('🐢 Slow page detected:', url);
        }

        // 🤖 Perform actions
        try {
            await clickButtons(page);
        } catch (err) {
            console.log('⚠️ Action error on page:', url);
        }

        // 🔐 Check logout
        if (await isLoggedOut(page)) {
            console.log('🔐 Detected logout! Re-logging in...');
            await login(page);
            continue;
        }

        // 🔗 Extract links
        let links = [];
        try {
            links = await getLinks(page);
        } catch (err) {
            console.log('⚠️ Failed to extract links from:', url);
        }

        console.log('🔗 Found links:', links.length);

        // ➕ Add new links
        for (const link of links) {
            const normalizedLink = normalizeUrl(link);

            if (!visited.has(normalizedLink) && !isBlocked(link)) {
                toVisit.push(link);
            }
        }
    }

    await browser.close();
}

run();