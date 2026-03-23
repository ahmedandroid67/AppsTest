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
// 🗂️ SPA SIDEBAR DISCOVERY (PROMPT-DRIVEN)
// ============================================================
async function discoverSpaMenuLinks(page) {
    const discovered = new Set();
    const startUrl = page.url();

    // 1. Find all parent menu buttons (usually have an icon or chevron)
    // We target anything in the sidebar area that looks like a toggle
    const sidebarArea = await page.$('aside, nav, [class*="sidebar"], [class*="menu"]');
    if (!sidebarArea) {
        console.log('   ℹ️ No sidebar container detected — normal page scan mode');
        return [];
    }

    const buttons = await sidebarArea.$$('button, [role="button"], .menu-toggle, .nav-item');
    console.log(`   🗂️ Probing ${buttons.length} potential sidebar elements...`);

    for (const btn of buttons) {
        try {
            const isVisible = await btn.isVisible().catch(() => false);
            if (!isVisible) continue;

            const text = (await btn.innerText().catch(() => '')).trim();
            // Skip buttons that are likely already sub-links
            if (!text) continue;

            // Click to ensure expansion (Vue v-if/v-show)
            await btn.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(600);

            // Harvest ANY <a> that is now visible in the whole sidebar area
            const links = await sidebarArea.$$('a');
            for (const link of links) {
                const linkText = (await link.innerText().catch(() => '')).trim();
                if (!linkText) continue;

                // Check if it's a JS-driven link (href="#" or no href)
                const href = await link.getAttribute('href').catch(() => null);
                
                // Only "probe" if it looks like a sub-menu item (href="#" is the giveaway)
                if (href === '#' || !href) {
                    const urlBefore = page.url();
                    
                    // Click it!
                    await link.click({ timeout: 3000 }).catch(() => {});
                    await page.waitForTimeout(1000); // Allow route change
                    
                    const urlAfter = page.url();
                    if (urlAfter && urlAfter !== urlBefore) {
                        console.log(`      ✅ Sub-link "${linkText}" → ${urlAfter}`);
                        discovered.add(urlAfter);
                        
                        // Go back to start to continue discovery
                        await page.goto(startUrl, { timeout: 10000, waitUntil: 'networkidle' }).catch(() => {});
                        await page.waitForTimeout(500);
                        
                        // Re-click the parent button to re-reveal the list (if navigation collapsed it)
                        await btn.click({ timeout: 1000 }).catch(() => {});
                        await page.waitForTimeout(300);
                    }
                } else if (href && !href.startsWith('javascript:')) {
                    // It's a real link, just add it to discovered
                    const fullUrl = new URL(href, startUrl).href;
                    discovered.add(fullUrl);
                }
            }
        } catch (err) {
            // Silently continue through sidebar probes
        }
    }

    return Array.from(discovered);
}

// ============================================================
// 🖱️ MAIN BUTTON / ACTION CLICKER
// ============================================================
async function clickButtons(page, pageResult) {
    const discoveredLinks = new Set();
    const currentUrl = page.url();

    // ── Pre-check: Is this a dashboard/main page with a sidebar? ──
    // If so, do the thorough sidebar expansion first
    if (currentUrl.includes('dashboard') || currentUrl.includes('home') || (await page.$('aside, nav'))) {
        try {
            const sidebarLinks = await discoverSpaMenuLinks(page);
            sidebarLinks.forEach(l => discoveredLinks.add(l));
        } catch (err) {
            console.log('⚠️ Sidebar discovery warning:', err.message);
        }
    }

    // ── MAIN INTERACTIVE ELEMENTS ──
    // Broadened to include <a> with no href or href="#" (typical SPA buttons)
    const interactiveSelectors = [
        'button',
        'a[href="#"]',
        'a:not([href])',
        '.btn',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '.v-list-item',
        '.nav-link'
    ];

    const seenTexts = new Set();
    const buttonsToClick = [];

    // Find all potential interactive things
    for (const sel of interactiveSelectors) {
        try {
            const els = await page.$$(sel);
            for (const el of els) {
                const text = (await el.innerText().catch(() => '')).trim().toLowerCase();
                const visible = await el.isVisible().catch(() => false);
                
                // Deduplicate by text so we don't click the same "Save" button 5 times if found by different selectors
                if (text && visible && !seenTexts.has(text)) {
                    seenTexts.add(text);
                    buttonsToClick.push({ el, text });
                }
            }
        } catch { }
    }

    const DANGEROUS = [
        'logout', 'log out', 'sign out', 'signout', 'déconnexion', 'deconnexion',
        'delete', 'remove', 'supprimer', 'quitter', 'dark', 'light'
    ];

    const ACTION_KEYWORDS = ['enregistrer', 'confirmer', 'ajouter', 'créer', 'submit', 'valider', 'mettre à jour', 'sauvegarder'];

    for (const { el, text } of buttonsToClick) {
        try {
            if (DANGEROUS.some(d => text.includes(d))) continue;

            // 🤖 Auto-fill forms for submit-like buttons
            if (ACTION_KEYWORDS.some(k => text.includes(k))) {
                const inputs = await page.$$('input:not([type="hidden"]), textarea, select');
                for (const input of inputs) {
                    try {
                        if (await input.isVisible()) {
                            const val = await input.inputValue().catch(() => '');
                            if (!val) await input.fill('TestAuto');
                        }
                    } catch { }
                }
            }

            const beforeUrl = page.url();
            console.log('👉 Action:', text);

            await el.click({ timeout: 4000 });
            await page.waitForTimeout(1000);

            const afterUrl = page.url();

            // Record navigation if it happened
            if (afterUrl !== beforeUrl) {
                discoveredLinks.add(afterUrl);
                console.log('   ✅ Navigated to:', afterUrl);
                // Return to previous page to continue clicking other buttons on this original page
                await page.goto(beforeUrl, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
            }

            // 🔍 Analyze UI for errors after the action
            const { errors } = await analyzeUI(page);
            if (errors.length > 0) {
                const screenshot = await takeScreenshot(page, 'ui-error');
                pageResult.screenshots.push(screenshot);
                pageResult.issues.push(...errors);
            }

        } catch (err) {
            // Action failed or timed out — move to next
        }
    }

    return Array.from(discoveredLinks);
}

module.exports = { clickButtons };