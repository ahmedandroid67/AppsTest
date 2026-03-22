const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const { clearReport, saveReport } = require('./engine/reporter');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// 📁 Serve UI
app.use('/', express.static(path.join(__dirname, 'ui')));

// 📂 Protected Reports
app.use('/reports', requireAuth, express.static(path.join(__dirname, 'reports')));

// 🔑 --- AUTH API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isAuthenticated = true;
        res.json({ success: true });
    } else {
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

// 📊 --- JOB HISTORY API ---
app.get('/api/jobs', requireAuth, (req, res) => {
    const jobsPath = path.join(__dirname, 'reports', 'jobs');
    if (!fs.existsSync(jobsPath)) return res.json([]);
    
    const jobs = fs.readdirSync(jobsPath)
        .filter(f => fs.lstatSync(path.join(jobsPath, f)).isDirectory())
        .map(id => {
            const reportPath = path.join(jobsPath, id, 'report.json');
            let data = {};
            if (fs.existsSync(reportPath)) {
                try { data = JSON.parse(fs.readFileSync(reportPath)); } catch {}
            }
            return { id, timestamp: id, pageCount: data.length || 0 };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        
    res.json(jobs);
});

// 🚀 --- ENGINE CORE ---

// Real-time Logging Bridge
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    originalLog(...args);
    io.emit('engine-log', args.join(' '));
};

console.error = (...args) => {
    originalError(...args);
    io.emit('engine-log', '❌ ' + args.join(' '));
};

// --- ENGINE STATE ---
let currentJob = null;
let cancelRequested = false;

app.get('/api/status', requireAuth, (req, res) => {
    res.json(currentJob || { status: 'idle' });
});

// 🛑 Cancel running scan
app.post('/api/cancel', requireAuth, (req, res) => {
    if (currentJob && currentJob.status === 'running') {
        cancelRequested = true;
        process.env.CANCEL_REQUESTED = 'true';
        console.log('🛑 Cancel requested by user');
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'No active scan to cancel' });
    }
});

function getDomain(url) {
    try {
        const domain = new URL(url || '').hostname;
        return domain.replace(/^www\./, '') || 'unknown';
    } catch (e) {
        return 'unknown';
    }
}

// Start test endpoint
app.post('/run', requireAuth, async (req, res) => {
    if (currentJob && currentJob.status === 'running') {
        return res.status(400).json({ error: 'Engine is already running a test.' });
    }

    const { url, email, password } = req.body;
    const domain = getDomain(url);
    const jobId = `${Date.now()}-${domain}`;
    
    currentJob = { status: 'running', url, jobId, startTime: Date.now() };

    console.log(`🚀 Starting test ${jobId} for: ${url}`);
    
    // 🔥 Return early to prevent HTTP Proxy/Gateway Timeouts
    res.json({ status: 'started', jobId });

    // 🚀 Execute in background
    (async () => {
        try {
            cancelRequested = false;
            process.env.CANCEL_REQUESTED = 'false';
            io.emit('engine-status', { status: 'running', url, jobId });

            process.env.TEST_URL = url;
            process.env.TEST_EMAIL = email;
            process.env.TEST_PASSWORD = password;
            process.env.CURRENT_JOB_ID = jobId;

            clearReport();
            delete require.cache[require.resolve('./tests/explorerTest')];
            const explorer = require('./tests/explorerTest');
            
            await explorer.run();

            if (cancelRequested) {
                console.log(`🛑 Test ${jobId} was cancelled by user.`);
                saveReport(jobId);
                currentJob = { status: 'cancelled', jobId, lastRun: Date.now() };
                io.emit('engine-status', currentJob);
            } else {
                saveReport(jobId);
                console.log(`✅ Test ${jobId} completed successfully!`);
                currentJob = { status: 'completed', jobId, lastRun: Date.now() };
                io.emit('engine-status', currentJob);
            }
        } catch (err) {
            console.error(err);
            currentJob = { status: 'error', error: err.message, lastRun: Date.now() };
            io.emit('engine-status', currentJob);
        }
    })();
});

app.delete('/api/jobs/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const jobPath = path.join(__dirname, 'reports', 'jobs', id);
    
    try {
        if (fs.existsSync(jobPath)) {
            fs.rmSync(jobPath, { recursive: true, force: true });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Job not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete job' });
    }
});

app.post('/delete-all', requireAuth, async (req, res) => {
    try {
        const jobsPath = path.join(__dirname, 'reports', 'jobs');
        if (fs.existsSync(jobsPath)) {
            fs.rmSync(jobsPath, { recursive: true, force: true });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear data' });
    }
});

// 🌐 Start server
server.listen(3000, () => {
    console.log('🌐 Server running at http://localhost:3000');
});

server.timeout = 0;