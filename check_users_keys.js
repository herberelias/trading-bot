const db = require('./src/db');
const trader = require('./src/trader');

async function run() {
    try {
        const [users] = await db.execute('SELECT id, nombre, bingx_key, bingx_secret, modo_real FROM users');
        console.log('--- USER KEYS & BALANCE STATUS ---');
        
        for (const u of users) {
            console.log(`User: ${u.nombre} (ID: ${u.id})`);
            console.log(`  Has Key: ${u.bingx_key ? 'YES (' + u.bingx_key.substring(0, 5) + '...)' : 'NO'}`);
            console.log(`  Has Secret: ${u.bingx_secret ? 'YES' : 'NO'}`);
            
            // Probar balance real
            try {
                const bal = await trader.getBalance(u);
                console.log(`  Balance Perpetuos: $${bal} USDT`);
            } catch (e) {
                console.log(`  Balance Perpetuos: ERROR (${e.message})`);
            }
            
            console.log('------------------------');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
