const { chromium } = require('playwright');

async function run() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto('https://medisys.laaraichi.com/');

    await page.waitForTimeout(3000);

    await browser.close();
}

run();