/**
 * debug_sidebar.js
 * Logs into https://sirh.laaraichi.com/ and dumps the sidebar DOM
 * so we can see the real HTML structure for menu/sub-menu items.
 */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: false }); // visible so we can see
    const page = await browser.newPage();

    // ── Login ────────────────────────────────────────────────
    await page.goto('https://sirh.laaraichi.com/');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').fill('admin@sirh.ma');
    await page.locator('input[type="password"]').fill('Admin@2024');
    await page.locator('button[type="submit"]').click();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // let Vue render everything

    console.log('Current URL:', page.url());

    // ── Dump 1: Potential sidebar containers ─────────────────
    const sidebarInfo = await page.evaluate(() => {
        const candidates = [
            'nav', 'aside', '[class*="sidebar"]', '[class*="sidenav"]',
            '[class*="menu"]', '[class*="nav-left"]', '[class*="left-panel"]'
        ];
        const results = [];
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el) {
                results.push({
                    selector: sel,
                    tag: el.tagName,
                    className: el.className,
                    id: el.id,
                    innerHTML: el.innerHTML.slice(0, 5000)
                });
            }
        }
        return results;
    });

    fs.writeFileSync('./sidebar_dump.json', JSON.stringify(sidebarInfo, null, 2));
    console.log('✅ sidebar_dump.json written —', sidebarInfo.length, 'containers found');

    // ── Dump 2: All <a> tags ─────────────────────────────────
    const allLinks = await page.$$eval('a', as =>
        as.map(a => ({
            href: a.href,
            text: a.innerText?.trim().slice(0, 60),
            class: a.className,
            parentTag: a.parentElement?.tagName,
            parentClass: a.parentElement?.className
        })).filter(a => a.href.includes('sirh.laaraichi.com'))
    );
    fs.writeFileSync('./all_links_before_click.json', JSON.stringify(allLinks, null, 2));
    console.log('✅ all_links_before_click.json written —', allLinks.length, 'links');

    // ── Dump 3: All <li> and likely menu item structures ─────
    const menuItems = await page.evaluate(() => {
        const items = document.querySelectorAll('li, [class*="item"], [class*="link"]');
        return Array.from(items).slice(0, 60).map(el => ({
            tag: el.tagName,
            class: el.className,
            id: el.id,
            ariaExpanded: el.getAttribute('aria-expanded'),
            text: el.innerText?.trim().slice(0, 60),
            hasUL: !!el.querySelector('ul'),
            hasA: !!el.querySelector('a'),
            aHref: el.querySelector('a')?.href,
            childCount: el.children.length
        }));
    });
    fs.writeFileSync('./menu_items.json', JSON.stringify(menuItems, null, 2));
    console.log('✅ menu_items.json written —', menuItems.length, 'items');

    // ── Dump 4: Click "Gestion Administrative RH" and re-check
    // Find anything that contains that text
    try {
        const parentEl = page.getByText(/gestion administrative rh/i).first();
        if (await parentEl.isVisible()) {
            console.log('▶ Clicking Gestion Administrative RH...');
            await parentEl.click();
            await page.waitForTimeout(1500);

            const allLinksAfter = await page.$$eval('a', as =>
                as.map(a => ({
                    href: a.href,
                    text: a.innerText?.trim().slice(0, 60),
                    class: a.className,
                    visible: a.offsetParent !== null // rough visibility check
                })).filter(a => a.href.includes('sirh.laaraichi.com'))
            );
            fs.writeFileSync('./all_links_after_click.json', JSON.stringify(allLinksAfter, null, 2));
            console.log('✅ all_links_after_click.json written —', allLinksAfter.length, 'links');

            // Also dump expanded container
            const expandedDom = await page.evaluate(() => {
                const expanded = document.querySelector('[aria-expanded="true"]');
                return {
                    found: !!expanded,
                    tag: expanded?.tagName,
                    class: expanded?.className,
                    innerHTML: expanded?.innerHTML?.slice(0, 3000)
                };
            });
            fs.writeFileSync('./expanded_dom.json', JSON.stringify(expandedDom, null, 2));
            console.log('✅ expanded_dom.json written. aria-expanded="true" found:', expandedDom.found);

            // Also check parent element of clicked item for sub-list
            const subMenuDom = await page.evaluate(() => {
                // Look for any ul/ol that is now visible inside sidebar
                const uls = document.querySelectorAll('ul li a, ol li a');
                return Array.from(uls).map(a => ({
                    href: a.href,
                    text: a.innerText?.trim(),
                    visible: window.getComputedStyle(a).display !== 'none'
                })).filter(a => a.href.includes('sirh'));
            });
            fs.writeFileSync('./submenu_links.json', JSON.stringify(subMenuDom, null, 2));
            console.log('✅ submenu_links.json written —', subMenuDom.length, 'sub-links found');
        } else {
            console.log('⚠️ Could not find "Gestion Administrative RH" element');
        }
    } catch (err) {
        console.log('⚠️ Click attempt failed:', err.message);
    }

    await browser.close();
    console.log('\n📁 All dump files written to project root. Check:');
    console.log('   sidebar_dump.json, menu_items.json, all_links_before_click.json');
    console.log('   all_links_after_click.json, expanded_dom.json, submenu_links.json');
})();
