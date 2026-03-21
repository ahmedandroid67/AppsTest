async function measureLoad(page, url) {
    try {
        const start = Date.now();

        await page.goto(url, { timeout: 10000 });
        await page.waitForLoadState('networkidle');

        const time = Date.now() - start;

        return time;
    } catch (err) {
        return -1;
    }
}

module.exports = { measureLoad };