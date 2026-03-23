const { analyzeUI } = require('./uiAnalyzer');
const fs = require('fs');

// 📸 Screenshot helper
async function takeScreenshot(page, name) {
    const dir = './reports/screenshots';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = `${dir}/${Date.now()}-${name}.png`;
    await page.screenshot({ path: filePath });
    return filePath.replace('./reports/', '');
}

// ============================================================
// 🗂️ SPA SIDEBAR DISCOVERY
// ============================================================
async function discoverSpaMenuLinks(page) {
    const discovered = new Set();
    const startUrl = page.url();

    // Aggressive sidebar search
    const sidebar = await page.$('aside, nav, [class*="sidebar"], [class*="menu"], .sidebar-wrapper');
    if (!sidebar) return [];

    const buttons = await sidebar.$$('button, [role="button"], .nav-item, .menu-item');
    console.log(`   🗂️ Probing ${buttons.length} sidebar element(s)...`);

    // Use indices to avoid stale handles
    for (let i = 0; i < buttons.length; i++) {
        try {
            // Re-acquire sidebar and buttons to stay fresh
            const freshSidebar = await page.$('aside, nav, [class*="sidebar"], [class*="menu"]');
            const freshBtns = await freshSidebar.$$('button, [role="button"], .nav-item, .menu-item');
            const btn = freshBtns[i];
            
            if (!await btn.isVisible()) continue;
            const text = (await btn.innerText()).trim();
            if (!text) continue;

            await btn.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(500);

            // Scrape discovered links
            const links = await freshSidebar.$$('a');
            for (const link of links) {
                const linkText = (await link.innerText()).trim();
                const href = await link.getAttribute('href').catch(() => null);
                
                if (href === '#' || !href) {
                    const before = page.url();
                    await link.click({ timeout: 3000 }).catch(() => {});
                    await page.waitForTimeout(800);
                    const after = page.url();
                    
                    if (after !== before) {
                        console.log(`      ✅ "${linkText}" → ${after}`);
                        discovered.add(after);
                        await page.goto(startUrl, { waitUntil: 'networkidle' }).catch(() => {});
                        // Re-expand the parent
                        const reSidebar = await page.$('aside, nav, [class*="sidebar"]');
                        const reBtns = await reSidebar.$$('button, [role="button"], .nav-item');
                        await reBtns[i].click().catch(() => {});
                        await page.waitForTimeout(300);
                    }
                } else if (href && !href.startsWith('javascript:')) {
                    discovered.add(new URL(href, startUrl).href);
                }
            }
        } catch (e) { }
    }
    return Array.from(discovered);
}

// ============================================================
// 🖱️ MAIN ACTION ENGINE
// ============================================================
async function clickButtons(page, pageResult) {
    const discoveredLinks = new Set();
    const beforeUrl = page.url();

    // 1. Sidebar Discovery (only if we appear to be on a main app page)
    if (await page.$('aside, nav, [class*="sidebar"]')) {
        try {
            const spaLinks = await discoverSpaMenuLinks(page);
            spaLinks.forEach(l => discoveredLinks.add(l));
        } catch (err) { }
    }

    // 2. Page Actions Loop (Self-Healing)
    const interactiveSelectors = [
        'button', 'a[href="#"]', 'a:not([href])', '.btn',
        '[role="button"]', '[role="link"]', '.v-list-item'
    ];

    // We identify buttons by index + text to handle re-acquisition
    let actionIndex = 0;
    let maxActions = 50; // Safety cap

    while (actionIndex < maxActions) {
        try {
            // RE-ACQUIRE all potential elements on every iteration (Prevents Stale Handles)
            const allElements = await page.$$(interactiveSelectors.join(', '));
            
            if (actionIndex >= allElements.length) break;

            const el = allElements[actionIndex];
            const text = (await el.innerText().catch(() => '')).trim().toLowerCase();
            const visible = await el.isVisible().catch(() => false);

            if (!text || !visible || text.includes('logout') || text.includes('déconnexion')) {
                actionIndex++;
                continue;
            }

            // Skip sidebar buttons in this generic loop to avoid redundant re-discovery
            const isSidebarItem = await el.evaluate(node => !!node.closest('aside, nav, .sidebar'));
            if (isSidebarItem) {
                actionIndex++;
                continue;
            }

            console.log('👉 Action:', text);

            // 🤖 Auto-fill forms if this looks like a submit
            const ACTION_KEYWORDS = ['enregistrer', 'confirmer', 'ajouter', 'créer', 'submit', 'valider', 'sauvegarder'];
            if (ACTION_KEYWORDS.some(k => text.includes(k))) {
                await page.evaluate(() => {
                    document.querySelectorAll('input:not([type="hidden"]), textarea').forEach(i => {
                        if (!i.value) i.value = 'TestAuto';
                        i.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                });
            }

            const urlBeforeClick = page.url();
            const domHashBefore = await page.evaluate(() => document.body.innerHTML.length);

            await el.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(1200); // Allow SPA / CSS transitions

            const urlAfterClick = page.url();
            const domHashAfter = await page.evaluate(() => document.body.innerHTML.length);

            // 🔍 DETECTION: Did something happen?
            if (urlAfterClick !== urlBeforeClick) {
                console.log('   ✅ Navigated to:', urlAfterClick);
                discoveredLinks.add(urlAfterClick);
                
                // CRITICAL: Return to original state to probe next button
                await page.goto(beforeUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(800);
            } else if (Math.abs(domHashAfter - domHashBefore) > 100) {
                // DOM changed significantly (likely a modal or expansion)
                console.log('   ✨ Interaction triggered UI change (modal/expansion)');
                const { errors } = await analyzeUI(page);
                if (errors.length > 0) {
                    pageResult.issues.push(...errors);
                    pageResult.screenshots.push(await takeScreenshot(page, 'action-ui-error'));
                }
            }

            actionIndex++;

        } catch (err) {
            actionIndex++; // Skip failing elements
        }
    }

    return Array.from(discoveredLinks);
}

module.exports = { clickButtons };