async function getLinks(page, baseUrl, visited = new Set()) {
    const links = await page.$$eval('a', as => as.map(a => a.href));

    const filtered = links.filter(link => {
        return (
            link.startsWith(baseUrl) &&   // only your app
            !link.includes('#') &&         // remove anchors
            !link.startsWith('tel:') &&
            !link.startsWith('mailto:')
        );
    });

    const newLinks = filtered.filter(link => !visited.has(link.split('?')[0]));

    return newLinks;
}

module.exports = { getLinks };