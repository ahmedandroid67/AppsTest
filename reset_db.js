const { Client } = require('pg');

async function reset() {
    const url = 'postgres://postgres:gAQTgqpTHOdBr2i50ZOTrcn7IVKVDuT62e6hgqxVpPKaWH1G60f7ymlBaPOrhHpw@jggc4k0c484sggg8gokwo848:5432/postgres';
    const client = new Client({ connectionString: url });

    try {
        console.log('Connecting...');
        await client.connect();
        console.log('Connected!');

        // Update the password
        // Assumes table 'users' or 'Employer' or 'AspNetUsers'
        // First, find the table and email column
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables:', res.rows.map(r => r.table_name));

        const tables = res.rows.map(r => r.table_name);
        const targetTable = tables.find(t => t.toLowerCase() === 'user' || t.toLowerCase() === 'users' || t.toLowerCase() === 'aspnetusers' || t.toLowerCase() === 'employer');
        
        if (!targetTable) {
            console.error('Could not find a user table!');
        } else {
            console.log(`Setting password for (medecin@gmail.com) in table (${targetTable})...`);
            // This is naive, might need a specific column for password
            await client.query(`UPDATE "${targetTable}" SET password = $1 WHERE email = $2 OR username = $2`, ['admin123', 'medecin@gmail.com']);
            console.log('✅ Password set successfully (assuming column is "password")');
        }

    } catch (err) {
        console.error('❌ Connection error:', err.message);
    } finally {
        await client.end();
    }
}

reset();
