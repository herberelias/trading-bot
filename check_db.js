const db = require('./src/db');

async function checkSchema() {
    try {
        const [rows] = await db.execute('DESC bot_trades');
        console.log('Columns in bot_trades:');
        rows.forEach(r => console.log(`- ${r.Field} (${r.Type})`));

        // Verificar si existe la columna comision
        const hasComision = rows.some(r => r.Field === 'comision');
        if (!hasComision) {
            console.log('Adding column "comision" to bot_trades...');
            await db.execute('ALTER TABLE bot_trades ADD COLUMN comision DECIMAL(10,5) DEFAULT 0');
            console.log('Column added.');
        } else {
            console.log('Table already has "comision" column.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit();
    }
}

checkSchema();
