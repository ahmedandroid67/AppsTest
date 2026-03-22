const { chromium } = require('playwright');
const { getLinks } = require('../engine/explorer');
const { clickButtons } = require('../engine/actions');
const { measureLoad } = require('../engine/analyzer');
const { addPageResult, saveReport } = require('../engine/reporter');
const { analyzeUI } = require('../engine/uiAnalyzer');

// 🌐 Dynamic config (from UI via server)
// 🌐 Dynamic config (from UI via server)
// 🌐 Dynamic config (from UI via server)
const BASE_URL = (process.env.TEST_URL || 'https://medisys.laaraichi.com/').replace(/\/$/, '');
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
    return url.split('?')[0].replace(/\/$/, '');
}

// 🔐 Detect logout accurately
async function isLoggedOut(page) {
    const url = page.url().toLowerCase();
    // Only logged out if we are on a login-like page AND a login field is visible
    const isLoginPage = url.includes('login') || url.includes('signin') || url.includes('account');
    const loginFieldVisible = await page.locator('#Input_Email, #email, #username, input[type=email], input[name=username]').first().isVisible().catch(() => false);

    return isLoginPage && loginFieldVisible;
}


// ============================================================
// 🔍 UNIVERSAL FIELD DETECTOR UTILITIES
// ============================================================

async function findLoginField(page, fieldType) {
    const strategies =
        fieldType === 'email'
            ? [
                // 1. Semantic type attributes
                'input[type="email"]',
                'input[type="text"][autocomplete="email"]',
                'input[type="text"][autocomplete="username"]',

                // 2. Common IDs
                '#email', '#username', '#user', '#login',
                '#Input_Email', '#Input_Username', '#loginEmail',
                '#userEmail', '#user_email', '#emailAddress',

                // 3. Name attributes
                'input[name="email"]', 'input[name="username"]',
                'input[name="user"]', 'input[name="login"]',
                'input[name="userEmail"]', 'input[name="identifier"]',

                // 4. Aria labels
                'input[aria-label*="email" i]',
                'input[aria-label*="username" i]',
                'input[aria-label*="login" i]',

                // 5. Placeholders
                'input[placeholder*="email" i]',
                'input[placeholder*="username" i]',
                'input[placeholder*="user name" i]',
                'input[placeholder*="login" i]',

                // 6. Data test attributes (React / Vue / Angular)
                'input[data-testid*="email" i]',
                'input[data-testid*="username" i]',
                'input[data-cy*="email" i]',
                'input[data-cy*="username" i]',

                // 7. Class-based fallbacks
                'input.email', 'input.username', 'input.login-input',
            ]
            : [
                // PASSWORD STRATEGIES
                'input[type="password"]',
                'input[autocomplete="current-password"]',
                'input[autocomplete="new-password"]',

                '#password', '#pass', '#passwd', '#pwd',
                '#Input_Password', '#loginPassword', '#userPassword',

                'input[name="password"]', 'input[name="pass"]',
                'input[name="passwd"]', 'input[name="pwd"]',

                'input[aria-label*="password" i]',
                'input[placeholder*="password" i]',

                'input[data-testid*="password" i]',
                'input[data-cy*="password" i]',
            ];

    for (const selector of strategies) {
        const field = page.locator(selector).first();
        const visible = await field.isVisible({ timeout: 500 }).catch(() => false);
        if (visible) {
            console.log(`   ✔ Found [${fieldType}] field via: ${selector}`);
            return field;
        }
    }

    return await fallbackFieldDetection(page, fieldType);
}

async function fallbackFieldDetection(page, fieldType) {
    console.log(`   ⚠️ Using positional fallback for [${fieldType}] field`);

    if (fieldType === 'password') {
        const field = page.locator('input[type="password"]').first();
        if (await field.isVisible().catch(() => false)) return field;
        throw new Error('❌ Could not locate password field on page: ' + page.url());
    }

    // For email/username: first visible plain text input
    const allInputs = page.locator('input[type="text"], input:not([type])');
    const count = await allInputs.count();

    for (let i = 0; i < count; i++) {
        const input = allInputs.nth(i);
        if (await input.isVisible().catch(() => false)) {
            console.log(`   ✔ Fallback: using visible text input #${i}`);
            return input;
        }
    }

    throw new Error('❌ Could not locate email/username field on page: ' + page.url());
}

async function findSubmitButton(page) {
    const strategies = [
        'button[type="submit"]',
        'input[type="submit"]',

        // Text-based (case-insensitive via :has-text is case-sensitive in Playwright,
        // so we list common variants)
        'button:has-text("Se connecter")',
        'button:has-text("Connexion")',
        'button:has-text("Login")',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        'button:has-text("Sign In")',
        'button:has-text("Submit")',
        'button:has-text("Continue")',
        'button:has-text("Continuer")',
        'button:has-text("Next")',

        // Class-based
        '.btn-primary', '.btn-login', '.btn-submit',
        '.login-btn', '.submit-btn',

        // Data attributes
        '[data-testid*="submit" i]',
        '[data-testid*="login" i]',
        '[data-cy*="submit" i]',
    ];

    for (const selector of strategies) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            console.log(`   ✔ Found submit button via: ${selector}`);
            return btn;
        }
    }

    throw new Error('❌ Could not locate a submit/login button on page: ' + page.url());
}

// ============================================================
// 🔐 UNIVERSAL LOGIN FUNCTION
// ============================================================

async function login(page) {
    console.log('🔐 Logging in...');

    await page.goto(BASE_URL);

    // ✅ Smart wait: adapt to actual load speed instead of a fixed delay
    await Promise.race([
        page.waitForLoadState('networkidle'),
        page.waitForTimeout(3000),
    ]);

    // ── Detect email/username field ──────────────────────────
    let emailField;
    try {
        emailField = await findLoginField(page, 'email');
    } catch {
        console.log('✅ No login fields found — assuming already logged in');
        return;
    }

    if (!(await emailField.isVisible().catch(() => false))) {
        console.log('✅ Login fields not visible — assuming already logged in');
        return;
    }

    // ── Optional: user-type selector ────────────────────────
    const userType = page.locator('#userType');
    if (await userType.isVisible().catch(() => false)) {
        console.log('ℹ️  Selecting user type...');
        await userType.selectOption({ label: 'Employé' }).catch(() => { });
    }

    // ── Fill credentials ─────────────────────────────────────
    let passField;
    try {
        passField = await findLoginField(page, 'password');
    } catch (err) {
        console.error('❌ Password field not found:', err.message);
        throw err;
    }

    await emailField.fill(EMAIL);
    await passField.fill(PASSWORD);

    // ── Submit ───────────────────────────────────────────────
    console.log('🚀 Submitting login...');

    let submitBtn;
    try {
        submitBtn = await findSubmitButton(page);
    } catch {
        // Last resort: press Enter in the password field
        console.log('   ⚠️ No submit button found — pressing Enter instead');
        await passField.press('Enter');
    }

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => { }),
        submitBtn ? submitBtn.click() : Promise.resolve(),
    ]);

    // ── Error detection ──────────────────────────────────────
    const errorSelectors = [
        '.text-danger', '.alert-danger', '.alert-error',
        '#error-message', '.error-message', '.login-error',
        '[role="alert"]', '.validation-summary-errors',
        'p.error', 'span.error', 'div.error',
    ].join(', ');

    const errorLocator = page.locator(errorSelectors).first();
    if (await errorLocator.isVisible().catch(() => false)) {
        const errorText = await errorLocator.innerText().catch(() => 'unknown error');
        console.error('❌ Login failed — error detected:', errorText.trim());
        throw new Error(`Login error: ${errorText.trim()}`);
    }

    // ── Post-login stabilisation ─────────────────────────────
    await Promise.race([
        page.waitForLoadState('networkidle'),
        page.waitForTimeout(5000),
    ]);

    console.log('✅ Login process finished');
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
            console.log('⛔ Skipping blocked:', url);
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

        // 🔐 Session check & recovery
        if (await isLoggedOut(page)) {
            console.log('🔐 Session lost → Attempting recovery...');
            await login(page);

            // Re-verify if login worked
            if (await isLoggedOut(page)) {
                console.log('❌ Recovery failed → skipping page');
                pageResult.issues.push('Session recovery failed');
                pageResult.severity = 'critical';
                addPageResult(pageResult);
                continue;
            } else {
                console.log('✅ Session recovered');
                // Re-navigate to the target URL to ensure we start from the right place
                await measureLoad(page, url);
            }
        }

        // 🤖 Perform actions and collect discovered links (from dropdowns/menus)
        let discoveredLinks = [];
        try {
            discoveredLinks = await clickButtons(page, pageResult) || [];
        } catch (err) {
            console.log('⚠️ Action error');
            pageResult.issues.push('Action error');
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