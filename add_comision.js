const db = require('./src/db');

async function check() {
    try {
        await db.execute('ALTER TABLE bot_trades ADD COLUMN comision DECIMAL(10,5) DEFAULT 0');
        console.log('Column comision added or already exists.');
    } catch (e) {
        if (e.code === 'ER_DUP_COLUMN_NAME') {
            console.log('Column comision already exists.');
        } else {
            console.error('Error:', e.message);
        }
    } finally {
        process.exit();
    }
}

check();
