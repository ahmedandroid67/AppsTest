const { chromium } = require('playwright');
const { getLinks } = require('../engine/explorer');
const { clickButtons } = require('../engine/actions');
const { measureLoad } = require('../engine/analyzer');
const { addPageResult, saveReport } = require('../engine/reporter');
const { analyzeUI } = require('../engine/uiAnalyzer');

// 🌐 Dynamic config (from UI via server)
const BASE_URL = process.env.TEST_URL || 'https://medisys.laaraichi.com/';
const EMAIL = process.env.TEST_EMAIL || 'medecin@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

// 🚫 Block heavy / unwanted routes
const BLOCKED_URLS = ['/Medicaments'];

function isBlocked(url) {
    return (
        BLOCKED_URLS.some(b => url.includes(b)) ||
        url.includes('Export') ||
        url.includes('handler=Export') ||
        url.endsWith('.pdf') ||
        url.endsWith('.xlsx')
    );
}

function normalizeUrl(url) {
    return url.split('?')[0];
}

// 🔐 Detect logout
async function isLoggedOut(page) {
    return await page.locator('#Input_Email').isVisible().catch(() => false);
}

// 🔐 Login function
async function login(page) {
    console.log('🔐 Logging in...');

    await page.goto(BASE_URL);

    // Already logged in
    if (!(await page.locator('#Input_Email').isVisible().catch(() => false))) {
        console.log('✅ Already logged in');
        return;
    }

    await page.fill('#Input_Email', EMAIL);
    await page.fill('#Input_Password', PASSWORD);

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('button[type=submit]')
    ]);

    console.log('✅ Login complete');
}

async function run() {
    const browser = await chromium.launch({ 
        headless: process.env.HEADLESS !== 'false' 
    });
    const page = await browser.newPage();

    await login(page);

    const toVisit = [BASE_URL];
    const visited = new Set();

    while (toVisit.length > 0) {
        const url = toVisit.shift();
        const normalizedUrl = normalizeUrl(url);

        if (isBlocked(url)) {
            console.log('⛔ Skipping:', url);
            continue;
        }

        if (visited.has(normalizedUrl)) continue;

        console.log('🌐 Visiting:', url);
        visited.add(normalizedUrl);

        const pageResult = {
            url,
            loadTime: null,
            issues: [],
            severity: 'low',
            screenshots: []
        };

        // ⏱ Measure load
        let loadTime = await measureLoad(page, url);

        if (loadTime === -1) {
            console.log('❌ Load failed');
            pageResult.issues.push('Load failed');
            pageResult.severity = 'critical';
            addPageResult(pageResult);
            continue;
        }

        pageResult.loadTime = loadTime;

        console.log('⏱️ Load:', loadTime, 'ms');

        if (loadTime > 5000) {
            pageResult.issues.push('Slow page');
            pageResult.severity = 'warning';
        }

        // 🤖 Perform actions
        try {
            await clickButtons(page, pageResult);
        } catch (err) {
            console.log('⚠️ Action error');
            pageResult.issues.push('Action error');
        }

        // 🔐 Check logout
        if (await isLoggedOut(page)) {
            console.log('🔐 Session lost → re-login');
            await login(page);
            pageResult.issues.push('Session lost');
            pageResult.severity = 'critical';
            addPageResult(pageResult);
            continue;
        }

        // 🔍 Final UI analysis
        try {
            const { errors } = await analyzeUI(page);

            if (errors.length > 0) {
                console.log('❌ UI errors detected');
                pageResult.issues.push(...errors);
                pageResult.severity = 'critical';
            }
        } catch {
            console.log('⚠️ UI analysis failed');
        }

        // 🔗 Extract links
        let links = [];
        try {
            links = await getLinks(page);
        } catch {
            console.log('⚠️ Link extraction failed');
            pageResult.issues.push('Link extraction failed');
        }

        console.log('🔗 Found links:', links.length);

        for (const link of links) {
            const normalizedLink = normalizeUrl(link);

            if (!visited.has(normalizedLink) && !isBlocked(link)) {
                toVisit.push(link);
            }
        }

        // 📊 Save result
        addPageResult(pageResult);
    }

    // 💾 Save final report with JobID
    saveReport(process.env.CURRENT_JOB_ID || 'latest');

    await browser.close();

    console.log('✅ Test completed');
}

module.exports = { run };

// 🚀 Run
if (require.main === module) {
    run();
}