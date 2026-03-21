async function analyzeUI(page) {
    try {
        const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());

        const errors = [];
        const successes = [];

        // ❌ Error keywords
        const errorKeywords = [
            'error',
            'invalid',
            'failed',
            'required',
            'obligatoire',
            'erreur'
        ];

        // ✅ Success keywords
        const successKeywords = [
            'success',
            'saved',
            'enregistré',
            'succès'
        ];

        for (const keyword of errorKeywords) {
            if (bodyText.includes(keyword)) {
                errors.push(keyword);
            }
        }

        for (const keyword of successKeywords) {
            if (bodyText.includes(keyword)) {
                successes.push(keyword);
            }
        }

        return { errors, successes };

    } catch (err) {
        return { errors: [], successes: [] };
    }
}

module.exports = { analyzeUI };