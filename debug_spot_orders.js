const traderSpot = require('./src/spot/trader');
const db = require('./src/db');

async function debug() {
    try {
        const [users] = await db.execute('SELECT * FROM users WHERE id = 1');
        const user = users[0];
        if (!user) {
            console.log('No se encontró el usuario 1');
            process.exit(1);
        }

        console.log('--- Debugging Spot Orders for Admin Principal ---');
        console.log('User Mode:', user.modo_real === 1 ? 'REAL' : 'SIMULADO');
        
        const orders = await traderSpot.getHistory(user, 'ETH-USDT', 50);
        console.log('Total orders received from BingX:', orders.length);
        
        if (orders.length > 0) {
            console.log('Sample Order:', JSON.stringify(orders[0], null, 2));
            
            const filtered = orders.filter(o => {
                const s = String(o.status).toUpperCase();
                const matched = s === '4' || s === '2' || s === 'FILLED' || s === 'PARTIALLY_FILLED' || s === 'SUCCESS';
                return matched;
            });
            console.log('Orders after status filter:', filtered.length);
            
            if (filtered.length > 0) {
                const mapped = filtered.map(o => ({
                    side: o.side,
                    status: o.status,
                    time: new Date(o.time).toISOString(),
                    monto: o.cummulativeQuoteQty
                }));
                console.log('Mapped Samples:', mapped.slice(0, 5));
            }
        } else {
            console.log('BingX no devolvió órdenes. Verifica API Keys y Permisos (deben tener lectura de Spot).');
        }

        process.exit(0);
    } catch (e) {
        console.error('Error en debug:', e);
        process.exit(1);
    }
}

debug();
