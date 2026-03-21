const { chromium } = require('playwright');
const { getLinks } = require('../engine/explorer');
const { clickButtons } = require('../engine/actions');
const { measureLoad } = require('../engine/analyzer');
const { addPageResult, saveReport } = require('../engine/reporter');
const { analyzeUI } = require('../engine/uiAnalyzer');

// ✅ BLOCKED
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

// 🔐 Login
async function login(page) {
    console.log('🔐 Logging in...');

    await page.goto('https://medisys.laaraichi.com/');

    if (!(await page.locator('#Input_Email').isVisible().catch(() => false))) {
        console.log('✅ Already logged in');
        return;
    }

    await page.fill('#Input_Email', 'medecin@gmail.com');
    await page.fill('#Input_Password', 'admin123');

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('button[type=submit]')
    ]);

    console.log('✅ Login complete');
}

async function run() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await login(page);

    const toVisit = ['https://medisys.laaraichi.com/'];
    const visited = new Set();

    while (toVisit.length > 0) {
        const url = toVisit.shift();
        const normalizedUrl = normalizeUrl(url);

        if (isBlocked(url)) continue;
        if (visited.has(normalizedUrl)) continue;

        console.log('🌐 Visiting:', url);
        visited.add(normalizedUrl);

        const pageResult = {
            url,
            loadTime: null,
            issues: [],
            severity: 'low'
        };

        let loadTime = await measureLoad(page, url);

        if (loadTime === -1) {
            pageResult.issues.push('Load failed');
            pageResult.severity = 'critical';
            addPageResult(pageResult);
            continue;
        }

        pageResult.loadTime = loadTime;

        if (loadTime > 5000) {
            pageResult.issues.push('Slow page');
            pageResult.severity = 'warning';
        }

        try {
            pageResult.screenshots = [];
            await clickButtons(page, pageResult);
        } catch {
            pageResult.issues.push('Action error');
        }

        if (await isLoggedOut(page)) {
            console.log('🔐 Re-login triggered');
            await login(page);
            pageResult.issues.push('Session lost');
            pageResult.severity = 'critical';
            addPageResult(pageResult);
            continue;
        }

        const { errors } = await analyzeUI(page);

        if (errors.length > 0) {
            pageResult.issues.push(...errors);
            pageResult.severity = 'critical';
        }

        let links = [];
        try {
            links = await getLinks(page);
        } catch {
            pageResult.issues.push('Link extraction failed');
        }

        for (const link of links) {
            const n = normalizeUrl(link);
            if (!visited.has(n) && !isBlocked(link)) {
                toVisit.push(link);
            }
        }

        addPageResult(pageResult);
    }

    saveReport();
    await browser.close();
}

run();