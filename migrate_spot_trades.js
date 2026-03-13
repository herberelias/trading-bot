require('dotenv').config();
const db = require('./src/db');

async function migrate() {
    try {
        console.log('Migrating spot_trades table...');
        
        // Add symbol column
        await db.query(`
            ALTER TABLE spot_trades 
            ADD COLUMN symbol VARCHAR(20) DEFAULT 'ETH-USDT' AFTER user_id
        `);
        console.log('- Added symbol column');

        // Optional: Rename cantidad_eth to cantidad
        await db.query(`
            ALTER TABLE spot_trades 
            CHANGE COLUMN cantidad_eth cantidad DECIMAL(20,8)
        `);
        console.log('- Renamed cantidad_eth to cantidad');

        console.log('Migration successful.');
    } catch (e) {
        console.error('Migration failed or already applied:', e.message);
    } finally {
        process.exit();
    }
}

migrate();
