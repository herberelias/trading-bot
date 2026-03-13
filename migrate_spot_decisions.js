require('dotenv').config();
const db = require('./src/db');

async function migrate() {
    try {
        console.log('Migrating spot_decisions table...');
        await db.query(`ALTER TABLE spot_decisions MODIFY COLUMN par VARCHAR(20)`);
        console.log('Migration successful.');
    } catch (e) {
        console.error('Migration failed:', e.message);
    } finally {
        process.exit();
    }
}

migrate();
