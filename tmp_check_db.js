require('dotenv').config();
const db = require('./src/db');

async function checkSchema() {
    try {
        const [columns] = await db.query('SHOW COLUMNS FROM spot_trades');
        console.log('Columns in spot_trades:');
        columns.forEach(col => console.log(`- ${col.Field} (${col.Type})`));
        
        const [tables] = await db.query('SHOW TABLES');
        console.log('\nTables in DB:');
        tables.forEach(t => console.log(`- ${Object.values(t)[0]}`));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit();
    }
}

checkSchema();
