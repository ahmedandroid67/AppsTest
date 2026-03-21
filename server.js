const express = require('express');
const app = express();

app.use(express.json());

app.post('/run', async (req, res) => {
    const { url, email, password } = req.body;

    console.log('🚀 Starting test:', url);

    // هنا تربط القيم مع مشروعك
    // يمكنك تخزينها في config أو environment

    // مثال بسيط:
    require('./tests/explorerTest');

    res.send({ status: 'started' });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});