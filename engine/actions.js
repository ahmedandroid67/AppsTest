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
}async function clickButtons(page, pageResult) {
    // 🖱️ Expanded element selection for buttons and menu toggles
    const buttons = await page.$$('button, a.dropdown-toggle, a[role="button"], .btn');
    const clickedTexts = new Set();
    const discoveredLinks = new Set();

    for (const btn of buttons) {
        try {
            let text = await btn.innerText();
            text = text.trim().toLowerCase();

            // Skip empty or already clicked
            if (!text || clickedTexts.has(text)) continue;

            // ⛔ Skip dangerous or common non-action buttons
            if (
                text.includes('logout') ||
                text.includes('log out') ||
                text.includes('sign out') ||
                text.includes('signout') ||
                text.includes('déconnexion') ||
                text.includes('deconnexion') ||
                text.includes('se déconnecter') ||
                text.includes('deconnecter') ||
                text.includes('disconnect') ||
                text.includes('delete') ||
                text.includes('remove') ||
                text.includes('supprimer') ||
                text.includes('quitter') ||
                text.includes('light') ||
                text.includes('dark') ||
                text.includes('se connecter') ||
                text.includes('login') ||
                text.includes('connexion') ||
                text.includes('change password') ||
                text.includes('modifier le mot de passe')
            ) {
                console.log('⛔ Skipping:', text);
                continue;
            }

            const isVisible = await btn.isVisible();
            if (!isVisible) continue;

            // 🤖 Auto-fill forms for submit-like buttons
            if (
                ['enregistrer', 'confirmer', 'ajouter', 'créer', 'submit', 'valider', 'mettre à jour']
                    .some(k => text.includes(k))
            ) {
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
            clickedTexts.add(text);

            await btn.click({ timeout: 5000 });
            await page.waitForTimeout(2000);

            const afterUrl = page.url();

            // 🔍 Discovery: Extract links immediately after click (for dropdowns)
            const activeLinks = await page.$$eval('a', as => as.map(a => a.href));
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
                const shouldNavigate = ['enregistrer', 'confirmer', 'ajouter', 'créer', 'submit', 'valider', 'mettre à jour']
                    .some(k => text.includes(k));

                if (shouldNavigate && errors.length === 0 && successes.length === 0) {
                    // Check if it's likely a menu toggle
                    const isToggle = text.includes('menu') || 
                                     text.includes('toggle') || 
                                     text.includes('ouvrir') || 
                                     text.includes('voir') ||
                                     text.includes('produits') ||
                                     text.includes('contacts') ||
                                     text.includes('inventaire') ||
                                     text.includes('facturation') ||
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