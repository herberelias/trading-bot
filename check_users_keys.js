const db = require('./src/db');
async function run() {
    try {
        const [users] = await db.execute('SELECT id, nombre, bingx_key, bingx_secret, modo_real FROM users');
        console.log('--- USER KEYS STATUS ---');
        users.forEach(u => {
            console.log(`User: ${u.nombre} (ID: ${u.id})`);
            console.log(`  Has Key: ${u.bingx_key ? 'YES (' + u.bingx_key.substring(0, 5) + '...)' : 'NO'}`);
            console.log(`  Has Secret: ${u.bingx_secret ? 'YES' : 'NO'}`);
            console.log(`  Modo Real: ${u.modo_real}`);
            console.log('------------------------');
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
