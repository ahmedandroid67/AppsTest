const fs = require('fs');

const report = [];

function addPageResult(data) {
    report.push(data);
}

function saveReport() {
    if (!fs.existsSync('./reports')) {
        fs.mkdirSync('./reports');
    }

    fs.writeFileSync(
        './reports/report.json',
        JSON.stringify(report, null, 2)
    );

    console.log('📊 Report saved to /reports/report.json');
}

module.exports = { addPageResult, saveReport };