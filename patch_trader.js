const fs = require('fs');
let content = fs.readFileSync('src/trader.js', 'utf8');

const oldCode = `            // BingX: cancelar ordenes SL existentes y crear nueva
            // Primero cancelamos ordenes abiertas de tipo STOP_MARKET
            try {
                await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol });
                logger.info('Ordenes abiertas canceladas para reemplazar SL.');
            } catch (e) {
                logger.error('No se pudieron cancelar ordenes previas', e.message);
            }`;

const newCode = `            try {
                // Cancelamos por simbolo
                const cancelRes = await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol });
                logger.info(\`Limpieza masiva realizada: \${JSON.stringify(cancelRes)}\`);
                
                // Extra: Consultar si quedan ordenes abiertas para este simbolo
                const openRes = await request('GET', '/openApi/swap/v2/trade/openOrders', { symbol });
                if (openRes && openRes.data && openRes.data.length > 0) {
                    logger.info(\`Quedan \${openRes.data.length} ordenes. Cancelando individualmente...\`);
                    for (const o of openRes.data) {
                        try {
                            await request('DELETE', '/openApi/swap/v2/trade/order', { symbol, orderId: o.orderId });
                        } catch (err) { /* ignore single cancel failure */ }
                    }
                }
            } catch (e) {
                logger.error('Error durante la limpieza de ordenes previas', e.message);
            }`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/trader.js', content);
console.log('Patch complete.');
