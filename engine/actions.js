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

async function clickButtons(page, pageResult) {
    const buttons = await page.$$('button');
    const clickedTexts = new Set();

    for (const btn of buttons) {
        try {
            let text = await btn.innerText();
            text = text.trim().toLowerCase();

            if (!text) continue;
            if (clickedTexts.has(text)) continue;

            // ⛔ Skip dangerous buttons
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
                console.log('⛔ Skipping button:', text);
                continue;
            }

            const isVisible = await btn.isVisible();
            if (!isVisible) continue;

            // 🤖 Auto-fill forms
            if (
                ['enregistrer', 'confirmer', 'ajouter', 'créer', 'submit', 'valider', 'mettre à jour']
                    .some(k => text.includes(k))
            ) {
                const inputs = await page.$$('input:not([type="hidden"]), textarea, select');

                for (const input of inputs) {
                    try {
                        const visible = await input.isVisible();
                        if (!visible) continue;

                        const type = await input.getAttribute('type');
                        const value = await input.inputValue();

                        if (!value && type !== 'checkbox' && type !== 'radio') {
                            await input.fill('TestAuto');
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

            // 🔍 UI ANALYSIS
            const { errors, successes } = await analyzeUI(page);

            if (errors.length > 0) {
                console.log('❌ UI Errors:', errors.join(', '));

                const screenshot = await takeScreenshot(page, 'ui-error');
                pageResult.screenshots.push(screenshot);
                pageResult.issues.push(...errors);
            }

            if (successes.length > 0) {
                console.log('✅ Success:', successes.join(', '));
            }

            // 🧠 Expected behavior
            const shouldNavigate =
                text.includes('enregistrer') ||
                text.includes('confirmer') ||
                text.includes('ajouter') ||
                text.includes('créer') ||
                text.includes('submit') ||
                text.includes('valider') ||
                text.includes('mettre à jour') ||
                text.includes('continuer') ||
                text.includes('imprimer') ||
                text.includes('suivant');

            // 🚨 VALIDATION
            if (beforeUrl === afterUrl) {
                if (shouldNavigate) {
                    if (errors.length > 0) {
                        console.log('⚠️ Validation failed:', text);

                        const screenshot = await takeScreenshot(page, 'validation-error');
                        pageResult.screenshots.push(screenshot);
                        pageResult.issues.push(`Validation failed: ${text}`);
                    } else if (successes.length > 0) {
                        console.log('ℹ️ Success without navigation:', text);
                    } else {
                        console.log('❌ Possible broken action:', text);

                        const screenshot = await takeScreenshot(page, 'broken-action');
                        pageResult.screenshots.push(screenshot);
                        pageResult.issues.push(`Broken action: ${text}`);
                    }
                } else {
                    console.log('ℹ️ No navigation (normal):', text);
                }
            } else {
                console.log('✅ Navigation:', text);
            }

        } catch {
            console.log('⚠️ Click failed');
        }
    }
}

module.exports = { clickButtons };