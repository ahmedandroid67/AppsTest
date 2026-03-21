const { chromium } = require('playwright');

async function check() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://medisys.laaraichi.com/');
    await page.fill('#Input_Email', 'medecin@gmail.com');
    await page.fill('#Input_Password', 'admin123');
    await page.click('button[type=submit]');
    await page.waitForLoadState('networkidle');

    console.log('Final URL:', page.url());
    const content = await page.content();
    console.log('Has #Input_Email:', await page.$('#Input_Email') !== null);
    if (await page.$('#Input_Email')) {
        console.log('Is #Input_Email visible:', await page.isVisible('#Input_Email'));
    }
    
    const buttons = await page.locator('button').allInnerTexts();
    console.log('Buttons:', buttons);
    
    const links = await page.locator('a').allInnerTexts();
    console.log('Links:', links);

    await browser.close();
}

check();
