require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '64.23.132.230',
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const db = pool;

async function fixDatabase() {
    try {
        console.log(`DB Config: ${process.env.DB_HOST}:${process.env.DB_PORT} / DB: ${process.env.DB_NAME}`);
        console.log('Checking and fixing spot_trades table...');
        
        // Check if 'symbol' exists in spot_trades
        const [cols] = await db.query('SHOW COLUMNS FROM spot_trades');
        const hasSymbol = cols.some(c => c.Field === 'symbol');
        const hasCantidadEth = cols.some(c => c.Field === 'cantidad_eth');
        const hasCantidad = cols.some(c => c.Field === 'cantidad');

        if (!hasSymbol) {
            console.log('- Adding symbol column to spot_trades');
            await db.query("ALTER TABLE spot_trades ADD COLUMN symbol VARCHAR(20) DEFAULT 'ETH-USDT' AFTER user_id");
        } else {
            console.log('- Column symbol already exists in spot_trades');
        }

        if (hasCantidadEth && !hasCantidad) {
            console.log('- Renaming cantidad_eth to cantidad');
            await db.query("ALTER TABLE spot_trades CHANGE COLUMN cantidad_eth cantidad DECIMAL(20,8)");
        }

        console.log('Checking spot_decisions table...');
        const [colsDec] = await db.query('SHOW COLUMNS FROM spot_decisions');
        const hasSymbolDec = colsDec.some(c => c.Field === 'symbol');
        const hasParDec = colsDec.some(c => c.Field === 'par');

        if (!hasSymbolDec && hasParDec) {
            console.log('- Adding symbol column to spot_decisions');
            await db.query("ALTER TABLE spot_decisions ADD COLUMN symbol VARCHAR(20) AFTER user_id");
            await db.query("UPDATE spot_decisions SET symbol = par");
        }

        console.log('Database fix completed.');
    } catch (e) {
        console.error('Error fixing database:', e.message);
    } finally {
        process.exit();
    }
}

fixDatabase();
