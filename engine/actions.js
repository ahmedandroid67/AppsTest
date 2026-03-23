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

    // important: return relative path for HTML
    return filePath.replace('./reports/', '');
}

// ============================================================
// 🗂️ SIDEBAR / COLLAPSIBLE MENU EXPANDER
// Finds top-level sidebar toggle items, clicks them to reveal
// sub-menu children, and returns the discovered child links.
// ============================================================
async function expandSidebarMenus(page) {
    const discoveredLinks = new Set();

    // Broad selector that catches common sidebar parent items:
    // li with a chevron/arrow icon, items with aria-expanded, Vue sidebar wrappers, etc.
    const menuParentSelectors = [
        // aria-expanded parents (most standards-compliant apps)
        '[aria-expanded]',
        // Common accordion / collapse trigger patterns
        '[data-toggle="collapse"]',
        '[data-bs-toggle="collapse"]',
        // Elements whose class implies they are sidebar group toggles
        '.menu-toggle',
        '.sidebar-toggle',
        '.nav-group-toggle',
        '.collapse-toggle',
        // sidebar items that contain a sub-list (ul/ol child)
        'li:has(ul)',
        'li:has(ol)',
        // Generic collapsible wrappers often used in Vue/React sidebars
        '.sidebar-item:has(.sidebar-submenu)',
        '.nav-item:has(.nav-submenu)',
        '.menu-item:has(.submenu)',
    ];

    // Collect unique element handles
    const seen = new WeakSet();
    const parents = [];

    for (const sel of menuParentSelectors) {
        try {
            const elements = await page.$$(sel);
            for (const el of elements) {
                if (!seen.has(el)) {
                    seen.add(el);
                    parents.push(el);
                }
            }
        } catch { /* selector not supported — skip */ }
    }

    console.log(`   🗂️ Found ${parents.length} potential sidebar parent(s) to expand`);

    for (const parent of parents) {
        try {
            const isVisible = await parent.isVisible().catch(() => false);
            if (!isVisible) continue;

            // Check if already expanded
            const expanded = await parent.getAttribute('aria-expanded').catch(() => null);
            const isAlreadyOpen = expanded === 'true';

            // Get label for logging
            const label = (await parent.innerText().catch(() => '')).trim().slice(0, 60) || '(no text)';

            if (!isAlreadyOpen) {
                console.log(`   ▶ Expanding menu: "${label}"`);
                await parent.click({ timeout: 3000 }).catch(() => {});
                // Wait for animation / Vue transition to complete
                await page.waitForTimeout(600);
            }

            // After expanding, harvest all visible links inside this parent
            const childLinks = await parent.$$eval('a', as => as.map(a => a.href)).catch(() => []);
            childLinks.forEach(l => {
                if (l && !l.startsWith('javascript:') && l !== window?.location?.href) {
                    discoveredLinks.add(l);
                }
            });

            // Also pick up links that appeared anywhere in the page after the click
            const pageLinks = await page.$$eval('a', as => as.map(a => a.href)).catch(() => []);
            pageLinks.forEach(l => discoveredLinks.add(l));

        } catch { /* element gone or unclickable — skip */ }
    }

    return Array.from(discoveredLinks);
}

// ============================================================
// 🖱️ MAIN BUTTON / ACTION CLICKER
// ============================================================
async function clickButtons(page, pageResult) {
    const discoveredLinks = new Set();

    // ── Step 1: Expand all sidebar collapsible menus first ──
    try {
        const sidebarLinks = await expandSidebarMenus(page);
        sidebarLinks.forEach(l => discoveredLinks.add(l));
        console.log(`   🔗 Sidebar expansion yielded ${sidebarLinks.length} link(s)`);
    } catch (err) {
        console.log('⚠️ Sidebar expansion error:', err.message);
    }

    // ── Step 2: Click interactive buttons / dropdowns ────────
    // Broadened selector: also covers div/li/span used as menu triggers
    // in Vue, React, Angular SPAs
    const interactiveSelectors = [
        'button',
        'a.dropdown-toggle',
        'a[role="button"]',
        '.btn',
        '[role="button"]',
        '[role="menuitem"]',
        '[role="tab"]',
        // Vue / custom sidebar patterns
        '.v-list-item',
        '.sidebar-link',
        '.nav-link',
        '.menu-item > a',
        '.menu-item > span',
    ];

    const seen = new Set();
    const buttons = [];

    for (const sel of interactiveSelectors) {
        try {
            const els = await page.$$(sel);
            for (const el of els) {
                // Deduplicate by element text to avoid double-clicking same node
                const text = (await el.innerText().catch(() => '')).trim().toLowerCase();
                if (text && !seen.has(text)) {
                    seen.add(text);
                    buttons.push({ el, text });
                }
            }
        } catch { }
    }

    const DANGEROUS = [
        'logout', 'log out', 'sign out', 'signout',
        'déconnexion', 'deconnexion', 'se déconnecter', 'deconnecter', 'disconnect',
        'delete', 'remove', 'supprimer', 'quitter',
        'light', 'dark',
        'se connecter', 'login', 'connexion',
        'change password', 'modifier le mot de passe',
    ];

    const ACTION_KEYWORDS = ['enregistrer', 'confirmer', 'ajouter', 'créer', 'submit', 'valider', 'mettre à jour'];

    for (const { el: btn, text } of buttons) {
        try {
            if (!text) continue;
            if (DANGEROUS.some(d => text.includes(d))) {
                console.log('⛔ Skipping:', text);
                continue;
            }

            const isVisible = await btn.isVisible().catch(() => false);
            if (!isVisible) continue;

            // 🤖 Auto-fill forms for submit-like buttons
            if (ACTION_KEYWORDS.some(k => text.includes(k))) {
                const inputs = await page.$$('input:not([type="hidden"]), textarea, select');
                for (const input of inputs) {
                    try {
                        if (await input.isVisible()) {
                            const type = await input.getAttribute('type');
                            const value = await input.inputValue();
                            if (!value && type !== 'checkbox' && type !== 'radio') {
                                await input.fill('TestAuto');
                            }
                        }
                    } catch { }
                }
            }

            const beforeUrl = page.url();

            console.log('👉 Clicking:', text);

            await btn.click({ timeout: 5000 });
            await page.waitForTimeout(800); // slightly longer — allow Vue transitions

            const afterUrl = page.url();

            // Harvest links immediately after click (dropdowns / menus revealed)
            const activeLinks = await page.$$eval('a', as => as.map(a => a.href)).catch(() => []);
            activeLinks.forEach(l => discoveredLinks.add(l));

            // 🔍 UI ANALYSIS
            const { errors, successes } = await analyzeUI(page);
            if (errors.length > 0) {
                console.log('❌ UI Errors:', errors.join(', '));
                const screenshot = await takeScreenshot(page, 'ui-error');
                pageResult.screenshots.push(screenshot);
                pageResult.issues.push(...errors);
            }

            // 🚨 NAVIGATION VALIDATION
            if (beforeUrl === afterUrl) {
                const shouldNavigate = ACTION_KEYWORDS.some(k => text.includes(k));

                if (shouldNavigate && errors.length === 0 && successes.length === 0) {
                    const isToggle =
                        text.includes('menu') || text.includes('toggle') ||
                        text.includes('ouvrir') || text.includes('voir') ||
                        text.includes('produits') || text.includes('contacts') ||
                        text.includes('inventaire') || text.includes('facturation') ||
                        text.includes('admin');

                    if (isToggle) {
                        console.log('ℹ️ Likely a menu toggle:', text);
                    } else {
                        console.log('❌ Possible broken action:', text);
                        const screenshot = await takeScreenshot(page, 'broken-action');
                        pageResult.screenshots.push(screenshot);
                        pageResult.issues.push(`Possible broken action: ${text}`);
                    }
                }
            } else {
                console.log('✅ Navigation:', text);
            }

        } catch (err) {
            console.log('⚠️ Click failed:', text);
        }
    }

    return Array.from(discoveredLinks);
}

module.exports = { clickButtons };