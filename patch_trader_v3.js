const fs = require('fs');
let content = fs.readFileSync('src/trader.js', 'utf8');

// 1. Añadir funcion de limpieza universal antes de updateStopLoss
const cleanupHelper = `
// Funcion para limpiar TODO (normal y gatillos) de forma garantizada en BingX
async function cleanAllOrders(symbol) {
    try {
        // A. Intento V2 Normal
        await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol });
        
        // B. Intento V2 con type=2 (Wait trigger orders)
        try {
            await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol, type: 2 });
        } catch(e) {}

        // C. Intento V1 (especifico para Stop Orders en versiones antiguas que aun viven)
        try {
            // BingX v1 tenia un endpoint especifico
            await request('DELETE', '/openApi/swap/v1/trade/cancelAllStopOrders', { symbol });
        } catch(e) {}

        logger.info('Limpieza universal de ordenes completada.');
    } catch (error) {
        logger.error('Error en limpieza universal:', error.message);
    }
}
`;

// Insertar antes de updateStopLoss
content = content.replace('async function updateStopLoss', cleanupHelper + '\nasync function updateStopLoss');

// 2. Reemplazar la limpieza en updateStopLoss
const oldUpdateClean = `            // BingX: cancelar ordenes SL existentes y crear nueva
            // Primero cancelamos ordenes abiertas de tipo STOP_MARKET
            try {
                await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol });
                logger.info('Ordenes abiertas canceladas para reemplazar SL.');
            } catch (e) {
                logger.error('No se pudieron cancelar ordenes previas', e.message);
            }`;

const newUpdateClean = `            // Limpieza profunda antes de poner nuevo SL
            await cleanAllOrders(symbol);`;

content = content.replace(oldUpdateClean, newUpdateClean);

// 3. Reemplazar cancelOpenOrders por la nueva funcion
const oldCancelFunc = `async function cancelOpenOrders() {
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

const newCancelFunc = `async function cancelOpenOrders() {
    const symbol = process.env.PAR;
    const isReal = process.env.MODO_REAL === 'true';
    if (!isReal) return logger.info('[SIMULADO] Cancelando ordenes');
    await cleanAllOrders(symbol);
}`;

content = content.replace(oldCancelFunc, newCancelFunc);

fs.writeFileSync('src/trader.js', content);
console.log('Patch V3 complete.');
