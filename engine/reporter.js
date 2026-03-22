const fs = require('fs');
const path = require('path');

let report = [];

function addPageResult(data) {
    report.push(data);
}

function clearReport() {
    report = [];
}

function saveReport(jobId = 'latest') {
    const baseDir = path.join(process.cwd(), 'reports');
    const jobsDir = path.join(baseDir, 'jobs');
    const currentJobDir = path.join(jobsDir, jobId);
    const screenshotsDir = path.join(baseDir, 'screenshots');
    const jobScreenshotsDir = path.join(currentJobDir, 'screenshots');

    // Ensure directories exist
    if (!fs.existsSync(jobsDir)) fs.mkdirSync(jobsDir, { recursive: true });
    if (!fs.existsSync(currentJobDir)) fs.mkdirSync(currentJobDir, { recursive: true });
    if (!fs.existsSync(jobScreenshotsDir)) fs.mkdirSync(jobScreenshotsDir, { recursive: true });

    // 📸 Update screenshot paths in the report object to reflect their new location
    // Paths are relative to the 'reports' directory
    const updatedReport = report.map(p => ({
        ...p,
        screenshots: p.screenshots.map(s => `jobs/${jobId}/${s}`)
    }));

    // 💾 Save report.json in job folder
    fs.writeFileSync(
        path.join(currentJobDir, 'report.json'),
        JSON.stringify(updatedReport, null, 2)
    );

    // 📂 Move screenshots to job folder
    if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir);
        for (const file of files) {
            const oldPath = path.join(screenshotsDir, file);
            const newPath = path.join(jobScreenshotsDir, file);
            if (fs.lstatSync(oldPath).isFile()) {
                fs.renameSync(oldPath, newPath);
            }
        }
    }

    // 🔗 Also update the 'latest' compatibility report
    fs.writeFileSync(
        path.join(baseDir, 'report.json'),
        JSON.stringify(updatedReport, null, 2)
    );

    console.log(`📊 Report saved to /reports/jobs/${jobId}/report.json`);
}

module.exports = { addPageResult, saveReport, clearReport };