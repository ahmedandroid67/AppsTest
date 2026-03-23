/**
 * debug_spa_nav.js  — verify the new SPA sidebar discovery works
 */
const { chromium } = require('playwright');

async function discoverSpaMenuLinks(page) {
    const discovered = new Set();

    // Step 1: Expand all sidebar section buttons
    const sidebarButtons = await page.$$('aside button, nav > div > button, nav button');
    console.log(`\n🗂️  Found ${sidebarButtons.length} sidebar section button(s)`);

    for (const btn of sidebarButtons) {
        try {
            const visible = await btn.isVisible().catch(() => false);
            if (!visible) continue;
            const label = (await btn.innerText().catch(() => '')).trim().slice(0, 60);
            await btn.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(500);
            console.log(`   ▶ Expanded: "${label}"`);
        } catch { }
    }

    // Step 2: Click each sidebar <a> and track where SPA navigates
    const sidebarLinks = await page.$$('aside a, nav a');
    console.log(`\n🔗 Found ${sidebarLinks.length} sidebar link(s) to probe`);

    for (const link of sidebarLinks) {
        try {
            const visible = await link.isVisible().catch(() => false);
            if (!visible) continue;

            const text = (await link.innerText().catch(() => '')).trim();
            if (!text) continue;

            const urlBefore = page.url();

            await link.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(800);

            const urlAfter = page.url();

            if (urlAfter !== urlBefore) {
                console.log(`   ✅ "${text}" → ${urlAfter}`);
                discovered.add(urlAfter);
            } else {
                console.log(`   ↔️  "${text}" → (no navigation)`);
            }

            // Go back for next probe
            await page.goBack({ timeout: 5000, waitUntil: 'networkidle' }).catch(() => {});
            await page.waitForTimeout(500);

            // Re-expand sections
            const btns = await page.$$('aside button, nav > div > button, nav button');
            for (const b of btns) {
                await b.click({ timeout: 2000 }).catch(() => {});
                await page.waitForTimeout(250);
            }

        } catch (err) {
            console.log(`   ⚠️  Error:`, err.message.slice(0, 80));
        }
    }

    return Array.from(discovered);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('🔐 Logging in...');
    await page.goto('https://sirh.laaraichi.com/');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').fill('admin@sirh.ma');
    await page.locator('input[type="password"]').fill('Admin@2024');
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('✅ Logged in. URL:', page.url());

    const urls = await discoverSpaMenuLinks(page);

    console.log('\n📊 DISCOVERED URLs:');
    urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
    console.log(`\nTotal: ${urls.length} unique URL(s) discovered`);

    await browser.close();
})();
