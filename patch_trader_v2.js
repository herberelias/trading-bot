const fs = require('fs');
let content = fs.readFileSync('src/trader.js', 'utf8');

const oldFunc = `async function cancelOpenOrders() {
    try {
        const symbol = process.env.PAR;
        const isReal = process.env.MODO_REAL === 'true';

        if (!isReal) {
            logger.info('[SIMULADO] Cancelando ordenes abiertas (trailing stops)');
            return;
        }

        const params = { symbol, timestamp: Date.now() };
        const signature = getSignature(params);
        const queryString = Object.keys(params)
            .sort()
            .map(key => \`\${key}=\${encodeURIComponent(params[key])}\`)
            .join('&') + \`&signature=\${signature}\`;

        const url = \`\${BASE_URL}/openApi/swap/v2/trade/allOpenOrders?\${queryString}\`;
        await axios({ method: 'DELETE', url, headers: { 'X-BX-APIKEY': API_KEY } });

        logger.info('Ordenes abiertas canceladas (trailing stops).');
    } catch (error) {
        logger.error('Error cancelando ordenes abiertas', error.message);
    }
}`;

const newFunc = `async function cancelOpenOrders() {
    try {
        const symbol = process.env.PAR;
        const isReal = process.env.MODO_REAL === 'true';

        if (!isReal) {
            logger.info('[SIMULADO] Cancelando ordenes abiertas');
            return;
        }

        // Limpieza de todas las ordenes (normales y trigger)
        await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol });
        
        // Verificacion adicional
        const openRes = await request('GET', '/openApi/swap/v2/trade/openOrders', { symbol });
        if (openRes && openRes.data && openRes.data.length > 0) {
            for (const o of openRes.data) {
                try {
                    await request('DELETE', '/openApi/swap/v2/trade/order', { symbol, orderId: o.orderId });
                } catch (err) { /* ignore */ }
            }
        }

        logger.info('Ordenes abiertas canceladas (incluyendo triggers).');
    } catch (error) {
        logger.error('Error cancelando ordenes abiertas', error.message);
    }
}`;

content = content.replace(oldFunc, newFunc);
fs.writeFileSync('src/trader.js', content);
console.log('Patch V2 complete.');
