const { chromium } = require('playwright');

async function run() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    const errors = [];

    // Capture console errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    // Capture failed requests
    page.on('response', response => {
        if (response.status() >= 400) {
            errors.push(`HTTP ${response.status()} - ${response.url()}`);
        }
    });

    await page.goto('https://medisys.laaraichi.com/');

    await page.fill('#Input_Email', 'medecin@gmail.com');
    await page.fill('#Input_Password', 'admin123');

    await page.click('.btn-login');

    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'login-result.png' });
    console.log('Current URL:', page.url());
    console.log('Errors:', errors);

    await browser.close();
}

run();