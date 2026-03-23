async function getLinks(page, baseUrl, visited = new Set()) {
    const links = await page.$$eval('a', as => as.map(a => a.href));

    const filtered = links.filter(link => {
        if (!link) return false;
        if (!link.startsWith(baseUrl)) return false;      // same origin only
        if (link.startsWith('tel:')) return false;
        if (link.startsWith('mailto:')) return false;
        if (link.startsWith('javascript:')) return false;

        // Skip bare fragment-only links that mean "stay on this page"
        // e.g.  https://example.com/page#  (empty hash, same page)
        // But KEEP real SPA route hashes like https://example.com/#/employees
        try {
            const url = new URL(link);
            // If path + hash = just "#" with nothing meaningful, skip it
            if (url.hash === '#' && url.pathname === new URL(baseUrl).pathname) return false;
        } catch { return false; }

        return true;
    });

    const newLinks = filtered.filter(link => {
        const normalized = link.replace(/\/$/, '').split('?')[0];
        return !visited.has(normalized);
    });

    return [...new Set(newLinks)];
}

module.exports = { getLinks };