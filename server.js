const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { clearReport } = require('./engine/reporter');

const app = express();
app.use(express.json());

// 🔐 Authentication Configuration
const ADMIN_USER = process.env.ENGINE_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ENGINE_ADMIN_PASS || 'admin123';

app.use(session({
    secret: 'autotest-engine-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// 🛡️ Authentication Middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.isAuthenticated) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// 📁 Serve UI (Static files are public, dashboard logic is handled in JS)
app.use('/', express.static(path.join(__dirname, 'ui')));

// 📂 Protected Reports (Dashboard + Screenshots)
app.use('/reports', requireAuth, express.static(path.join(__dirname, 'reports')));

// 🔑 --- AUTH API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isAuthenticated = true;
        console.log('✅ Login successful for:', username);
        res.json({ success: true });
    } else {
        console.log('❌ Failed login attempt for:', username);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth-check', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.isAuthenticated) });
});

// 🚀 --- PROTECTED ENGINE API ---

// Run test endpoint
app.post('/run', requireAuth, async (req, res) => {
    const { url, email, password } = req.body;

    console.log('🚀 Starting test with:', url);

    try {
        // ⚡ Pass env variables to test
        process.env.TEST_URL = url;
        process.env.TEST_EMAIL = email;
        process.env.TEST_PASSWORD = password;

        // Reset report in memory
        clearReport();

        // Clear cache so script reruns
        delete require.cache[require.resolve('./tests/explorerTest')];

        const explorer = require('./tests/explorerTest');
        
        // 🏁 Wait for test to actually finish
        await explorer.run();

        res.json({ status: 'completed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to start test' });
    }
});

// 🗑️ Delete all data endpoint
app.post('/delete-all', requireAuth, async (req, res) => {
    try {
        const reportPath = path.join(__dirname, 'reports', 'report.json');
        const screenshotsDir = path.join(__dirname, 'reports', 'screenshots');

        // 1. Reset report.json
        fs.writeFileSync(reportPath, '[]');
        
        // Also reset memory report
        clearReport();

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
const server = app.listen(3000, () => {
    console.log('🌐 Server running at http://localhost:3000');
});

// ⏳ Allow long-running requests for tests
server.timeout = 0;