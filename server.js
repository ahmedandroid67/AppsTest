const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// 📁 Serve UI (index.html)
app.use('/', express.static(path.join(__dirname, 'ui')));

// 📁 Serve reports (dashboard + screenshots)
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// 🚀 Run test endpoint
app.post('/run', async (req, res) => {
    const { url, email, password } = req.body;

    console.log('🚀 Starting test with:', url);

    try {
        // ⚡ Pass env variables to test
        process.env.TEST_URL = url;
        process.env.TEST_EMAIL = email;
        process.env.TEST_PASSWORD = password;

        // Clear cache so script reruns
        delete require.cache[require.resolve('./tests/explorerTest')];

        require('./tests/explorerTest');

        res.json({ status: 'started' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to start test' });
    }
});

// 🗑️ Delete all data endpoint
app.post('/delete-all', async (req, res) => {
    try {
        const reportPath = path.join(__dirname, 'reports', 'report.json');
        const screenshotsDir = path.join(__dirname, 'reports', 'screenshots');

        // 1. Reset report.json
        fs.writeFileSync(reportPath, '[]');

        // 2. Clear screenshots folder
        if (fs.existsSync(screenshotsDir)) {
            const files = fs.readdirSync(screenshotsDir);
            for (const file of files) {
                const filePath = path.join(screenshotsDir, file);
                if (fs.lstatSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            }
        }

        console.log('🗑️ All data and screenshots cleared.');
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Failed to clear data:', err);
        res.status(500).json({ error: 'Failed to clear data' });
    }
});

// 🌐 Start server
app.listen(3000, () => {
    console.log('🌐 Server running at http://localhost:3000');
});