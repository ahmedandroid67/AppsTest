const BASE_URL = 'https://medisys.laaraichi.com';

const visited = new Set();

async function getLinks(page) {
    const links = await page.$$eval('a', as => as.map(a => a.href));

    const filtered = links.filter(link => {
        return (
            link.startsWith(BASE_URL) &&   // only your app
            !link.includes('#') &&         // remove anchors
            !link.startsWith('tel:') &&
            !link.startsWith('mailto:')
        );
    });

    const newLinks = filtered.filter(link => !visited.has(link));

    newLinks.forEach(link => visited.add(link));

    return newLinks;
}

module.exports = { getLinks };