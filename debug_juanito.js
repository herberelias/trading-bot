const db = require('./src/db');

async function checkJuanito() {
    try {
        console.log('--- USUARIOS ---');
        const [users] = await db.execute('SELECT id, nombre, modo_real FROM users');
        console.table(users);

        console.log('\n--- ÚLTIMAS DECISIONES SPOT (JUANITO) ---');
        const [decisions] = await db.execute('SELECT * FROM bot_decisions_spot WHERE user_id = 3 ORDER BY id DESC LIMIT 10');
        console.table(decisions);

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkJuanito();
