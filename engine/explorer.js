async function getLinks(page, baseUrl, visited = new Set()) {
    const links = await page.$$eval('a', as => as.map(a => a.href));

    const filtered = links.filter(link => {
        if (!link.startsWith(baseUrl)) return false;       // must be same origin+base
        if (link.startsWith('tel:')) return false;
        if (link.startsWith('mailto:')) return false;
        if (link.startsWith('javascript:')) return false;

        // ✅ Allow hash-router URLs (e.g. /dashboard#section)
        // Only strip PURE fragment-only anchors like "https://example.com/page#"
        // that point to the SAME page (no real path change).
        const url = new URL(link);
        const hash = url.hash;

        // If it's just "#" with nothing after it — skip (same page anchor)
        if (hash === '#' || hash === '') {
            // no fragment or empty fragment — treat as regular URL, allow it
        }
        // If it has a meaningful hash (e.g. "#/dashboard", "#section") keep it
        // so hash-router apps get their pages discovered.

        return true;
    });

    const newLinks = filtered.filter(link => {
        // Normalize: strip trailing slash but keep hash path for SPA routing
        const normalized = link.replace(/\/$/, '');
        return !visited.has(normalized.split('?')[0]);
    });

    // Deduplicate
    return [...new Set(newLinks)];
}

module.exports = { getLinks };