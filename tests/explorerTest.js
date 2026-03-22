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
    await page.waitForTimeout(2000);

    // Try to find email/username field
    const emailField = page.locator('#Input_Email, #email, #username, input[type=email], input[name=username]').first();
    const passField = page.locator('#Input_Password, #password, input[type=password]').first();

    if (!(await emailField.isVisible().catch(() => false))) {
        console.log('✅ No login fields found, assuming already logged in');
        return;
    }

    // Optional: Select user type if selector exists
    const userType = page.locator('#userType');
    if (await userType.isVisible()) {
        console.log('ℹ️ Selecting user type...');
        await userType.selectOption({ label: 'Employé' }).catch(() => {});
    }

    await emailField.fill(EMAIL);
    await passField.fill(PASSWORD);

    console.log('🚀 Submitting login...');

    const submitBtn = page.locator('button[type=submit], button:has-text("Se connecter"), button:has-text("Login"), .btn-primary').first();
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
        submitBtn.click()
    ]);

    console.log('✅ Login complete');
    await page.waitForTimeout(2000);
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

        // 🤖 Perform actions and collect discovered links (from dropdowns/menus)
        let discoveredLinks = [];
        try {
            discoveredLinks = await clickButtons(page, pageResult) || [];
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

        // 🔗 Extract regular links and merge with discovered ones
        let links = [];
        try {
            const pageLinks = await getLinks(page, BASE_URL, visited);
            links = [...new Set([...pageLinks, ...discoveredLinks])];
        } catch (err) {
            console.log('⚠️ Link extraction failed:', err.message);
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