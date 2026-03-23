/**
 * debug_spa_nav2.js — deeper DOM inspection after button expand
 */
const { chromium } = require('playwright');

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
    console.log('✅ URL:', page.url());

    // 1. Counts before any clicks
    const before = await page.evaluate(() => {
        const allA = document.querySelectorAll('a');
        const navA = document.querySelectorAll('nav a, aside a');
        return {
            totalA: allA.length,
            navA: navA.length,
            navADetails: Array.from(navA).map(a => ({
                href: a.href,
                text: a.innerText?.trim().slice(0, 40),
                display: window.getComputedStyle(a).display,
                visibility: window.getComputedStyle(a).visibility,
                offsetParent: a.offsetParent !== null
            }))
        };
    });
    console.log('\n📋 BEFORE clicks:');
    console.log('  Total <a>:', before.totalA);
    console.log('  nav/aside <a>:', before.navA);
    console.log('  Details:', JSON.stringify(before.navADetails, null, 2));

    // 2. Click first button (GESTION ADMINISTRATIVE RH)
    const buttons = await page.$$('aside button, nav > div > button, nav button');
    console.log(`\n🗂️ Found ${buttons.length} buttons`);
    
    if (buttons.length > 1) {
        const btn = buttons[1];
        const label = (await btn.innerText()).trim().slice(0, 60);
        console.log(`▶ Clicking: "${label}"`);
        await btn.click();
        await page.waitForTimeout(1000);

        // 3. Check DOM after click
        const after = await page.evaluate(() => {
            const navA = document.querySelectorAll('nav a, aside a');
            return {
                count: navA.length,
                details: Array.from(navA).map(a => ({
                    href: a.href,
                    text: a.innerText?.trim().slice(0, 40),
                    display: window.getComputedStyle(a).display,
                    visibility: window.getComputedStyle(a).visibility,
                    offsetParent: a.offsetParent !== null,
                    parentDisplay: a.parentElement ? window.getComputedStyle(a.parentElement).display : null,
                    parentStyle: a.parentElement?.style?.display
                }))
            };
        });

        console.log('\n📋 AFTER clicking section:');
        console.log('  nav/aside <a> count:', after.count);
        console.log('  Details:', JSON.stringify(after.details, null, 2));
    }

    // 4. Check how many buttons exist inside nav (not aside)
    const navStructure = await page.evaluate(() => {
        const nav = document.querySelector('nav');
        if (!nav) return 'no nav found';
        
        const result = {
            navTag: nav.tagName,
            directChildCount: nav.children.length,
            children: Array.from(nav.children).map(c => ({
                tag: c.tagName,
                class: c.className,
                childCount: c.children.length,
                firstChildTag: c.children[0]?.tagName,
                buttons: c.querySelectorAll('button').length,
                anchors: c.querySelectorAll('a').length,
                anchorHrefs: Array.from(c.querySelectorAll('a')).map(a => ({
                    href: a.href,
                    text: a.innerText?.trim().slice(0, 30),
                    inlineDisplay: a.style?.display,
                    computedDisplay: window.getComputedStyle(a).display
                }))
            }))
        };
        return result;
    });

    console.log('\n🏗️ NAV STRUCTURE:', JSON.stringify(navStructure, null, 2));

    await browser.close();
})();
