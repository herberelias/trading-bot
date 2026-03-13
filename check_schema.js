require('dotenv').config();
const db = require('./src/db');

async function check() {
    try {
        const [rows] = await db.query('DESCRIBE spot_trades');
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit();
    }
}
check();
