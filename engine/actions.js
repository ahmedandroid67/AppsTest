const { analyzeUI } = require('./uiAnalyzer');

async function clickButtons(page) {
    const buttons = await page.$$('button');
    const clickedTexts = new Set();

    for (const btn of buttons) {
        try {
            let text = await btn.innerText();
            text = text.trim().toLowerCase();

            // ⛔ Skip empty
            if (!text) continue;

            // ⛔ Skip duplicates
            if (clickedTexts.has(text)) continue;

            // ⛔ Skip dangerous buttons
            if (
                text.includes('logout') ||
                text.includes('log out') ||
                text.includes('sign out') ||
                text.includes('delete') ||
                text.includes('remove') ||
                text.includes('quitter') ||
                text.includes('light') ||
                text.includes('dark')
            ) {
                console.log('⛔ Skipping button:', text);
                continue;
            }

            const isVisible = await btn.isVisible();
            if (!isVisible) continue;

            // 🤖 AUTO-FILL inputs before submitting
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
                            await input.fill('Test Auto');
                        }
                    } catch (e) { }
                }
            }

            // 🧠 BEFORE STATE
            const beforeUrl = page.url();

            console.log('👉 Clicking button:', text);

            clickedTexts.add(text);

            await btn.click({ timeout: 5000 });

            // wait for UI updates / navigation
            await page.waitForTimeout(2000);

            // 🧠 AFTER STATE
            const afterUrl = page.url();

            // 🔍 UI ANALYSIS
            const { errors, successes } = await analyzeUI(page);

            if (errors.length > 0) {
                console.log('❌ UI Errors detected:', errors.join(', '));
            }

            if (successes.length > 0) {
                console.log('✅ Success detected:', successes.join(', '));
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
                text.includes('suivant');

            // 🚨 SMART VALIDATION
            if (beforeUrl === afterUrl) {
                if (shouldNavigate) {
                    if (errors.length > 0) {
                        console.log('⚠️ Form validation failed:', text);
                    } else if (successes.length > 0) {
                        console.log('ℹ️ Action succeeded without navigation:', text);
                    } else {
                        console.log('❌ Possible broken action:', text);
                    }
                } else {
                    console.log('ℹ️ No navigation (normal):', text);
                }
            } else {
                console.log('✅ Navigation detected:', text);
            }

        } catch (e) {
            console.log('⚠️ Failed clicking button');
        }
    }
}

module.exports = { clickButtons };