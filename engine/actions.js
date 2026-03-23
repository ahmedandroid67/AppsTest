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
//
// The SIRH sidebar structure (Vue, v-if rendering):
//   <nav>
//     <div>                          ← section wrapper
//       <button>Section Title</button>  ← toggle (shows/hides children)
//       <div>                        ← child container (v-if, added on click)
//         <a href="#">Sub-item</a>   ← navigates via Vue Router @click
//       </div>
//     </div>
//     ...more sections
//   </nav>
//
// Strategy:
//   For each section <div> in the nav:
//     1. Click its <button> to expand (adds child <a> tags to DOM)
//     2. Collect the sibling <a> tags that appeared
//     3. Click each <a> and record where the SPA navigates
//     4. Return to original URL; repeat for next section
// ============================================================
async function discoverSpaMenuLinks(page) {
    const discovered = new Set();
    const startUrl = page.url();

    // Each section is a direct child <div> of <nav>
    // Structure: nav > div (×N sections)
    const sectionCount = await page.evaluate(() => {
        const nav = document.querySelector('nav');
        return nav ? nav.children.length : 0;
    });

    console.log(`   🗂️ Found ${sectionCount} sidebar section(s) to probe`);

    for (let i = 0; i < sectionCount; i++) {
        try {
            // Get the button in this section
            const sectionBtn = await page.$(`nav > div:nth-child(${i + 1}) > button`);
            if (!sectionBtn) {
                console.log(`   ⚠️ Section ${i + 1}: no button found`);
                continue;
            }

            const btnLabel = (await sectionBtn.innerText().catch(() => '')).trim().slice(0, 60);

            // Click the button to expand sub-items (v-if renders them now)
            await sectionBtn.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(600);

            // Collect <a> tags that are now inside this section's sub-container
            const anchorsInSection = await page.$$(`nav > div:nth-child(${i + 1}) a`);

            if (anchorsInSection.length === 0) {
                console.log(`   ↔️ Section "${btnLabel}": no sub-links appeared`);
                continue;
            }

            console.log(`   ▶ Section "${btnLabel}": ${anchorsInSection.length} sub-link(s) found`);

            // Click each sub-link and track the resulting URL
            for (let j = 0; j < anchorsInSection.length; j++) {
                try {
                    // Re-query because DOM may have changed after navigation/back
                    // Re-expand the section first
                    const btn2 = await page.$(`nav > div:nth-child(${i + 1}) > button`);
                    if (btn2) {
                        // Check if section is currently expanded (has child anchors)
                        const currentAnchors = await page.$$(`nav > div:nth-child(${i + 1}) a`);
                        if (currentAnchors.length === 0) {
                            await btn2.click({ timeout: 2000 }).catch(() => {});
                            await page.waitForTimeout(500);
                        }
                    }

                    const anchor = await page.$(`nav > div:nth-child(${i + 1}) a:nth-child(${j + 1})`);
                    if (!anchor) continue;

                    const anchorText = (await anchor.innerText().catch(() => '')).trim();
                    const visible = await anchor.isVisible().catch(() => false);
                    if (!visible) continue;

                    const urlBefore = page.url();

                    await anchor.click({ timeout: 3000 }).catch(() => {});
                    await page.waitForTimeout(1000);

                    const urlAfter = page.url();

                    if (urlAfter && urlAfter !== urlBefore) {
                        console.log(`      ✅ "${anchorText}" → ${urlAfter}`);
                        discovered.add(urlAfter);
                    } else {
                        console.log(`      ↔️ "${anchorText}" → (no navigation)`);
                    }

                    // Navigate back to the dashboard
                    if (page.url() !== startUrl) {
                        await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
                        await page.waitForTimeout(500);
                    }

                } catch (err) {
                    console.log(`      ⚠️ Sub-link error: ${err.message.slice(0, 60)}`);
                }
            }

        } catch (err) {
            console.log(`   ⚠️ Section ${i + 1} error: ${err.message.slice(0, 60)}`);
        }
    }

    console.log(`   📊 SPA discovery complete: ${discovered.size} unique URL(s)`);
    return Array.from(discovered);
}

// ============================================================
// 🖱️ MAIN BUTTON / ACTION CLICKER
// ============================================================
async function clickButtons(page, pageResult) {
    const discoveredLinks = new Set();

    // ── Step 1: SPA sidebar click-and-track navigation ──────
    try {
        const spaLinks = await discoverSpaMenuLinks(page);
        spaLinks.forEach(l => discoveredLinks.add(l));
    } catch (err) {
        console.log('⚠️ SPA sidebar discovery error:', err.message);
    }

    // ── Step 2: Click remaining interactive elements ─────────
    const interactiveSelectors = [
        'button',
        '[role="button"]',
        '[role="menuitem"]',
        '[role="tab"]',
        'a.dropdown-toggle',
        '.btn',
    ];

    const seenTexts = new Set();
    const buttons = [];

    for (const sel of interactiveSelectors) {
        try {
            const els = await page.$$(sel);
            for (const el of els) {
                const text = (await el.innerText().catch(() => '')).trim().toLowerCase();
                if (text && !seenTexts.has(text)) {
                    seenTexts.add(text);
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
            await page.waitForTimeout(800);

            const afterUrl = page.url();

            // Harvest links after click
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