const fs = require('fs');
let code = fs.readFileSync('src/trader.js', 'utf8');

const closeCode = `
// NUEVA FUNCION: Revisar trades en BD y cerrarlos si ya no existen en BingX
async function checkAndCloseTrades() {
    try {
        const symbol = process.env.PAR;
        const [openTrades] = await db.execute(\`
            SELECT id, direccion as accion, capital_usado, precio_entrada, apalancamiento 
            FROM bot_trades 
            WHERE timestamp_cierre IS NULL AND modo = ?
        \`, [process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO']);

        if (openTrades.length === 0) return;

        let activePositions = [];
        if (process.env.MODO_REAL === 'true') {
            const positions = await getPositions(symbol);
            activePositions = positions.filter(p => p.positionSide === 'LONG' || p.positionSide === 'SHORT');
        }

        let recentOrders = [];
        if (process.env.MODO_REAL === 'true') {
            try {
                const resOrders = await request('GET', '/openApi/swap/v2/trade/allFillOrders', { symbol, limit: 100 });
                recentOrders = resOrders.data || [];
            } catch(e) {}
        }

        for (const trade of openTrades) {
            if (process.env.MODO_REAL !== 'true') continue;

            const isOpen = activePositions.some(p => p.positionSide === trade.accion);
            if (isOpen) continue;

            logger.info(\`Verificando cierre de trade ID \${trade.id} (\${trade.accion})...\`);

            const closeSide = trade.accion === 'LONG' ? 'SELL' : 'BUY';
            const filledOrder = recentOrders.find(o => o.side === closeSide && parseFloat(o.price) > 0);
            
            let precioCierre = filledOrder ? parseFloat(filledOrder.price) : null;
            
            if (!precioCierre) {
                try {
                    const marketRes = await request('GET', '/openApi/swap/v2/quote/ticker', { symbol });
                    if(marketRes.data && marketRes.data.lastPrice) {
                        precioCierre = parseFloat(marketRes.data.lastPrice);
                    }
                } catch(e) {}
            }

            if (!precioCierre) precioCierre = trade.precio_entrada; // fallback fallback

            const capital = parseFloat(trade.capital_usado);
            const entrada = parseFloat(trade.precio_entrada);
            const apalancamiento = parseFloat(trade.apalancamiento) || 10;
            
            let gananciaPerdida = 0;
            if (trade.accion === 'LONG') {
                gananciaPerdida = ((precioCierre - entrada) / entrada) * capital * apalancamiento;
            } else {
                gananciaPerdida = ((entrada - precioCierre) / entrada) * capital * apalancamiento;
            }

            const resultado = gananciaPerdida > 0 ? 'WIN' : 'LOSS';

            await db.execute(\`
                UPDATE bot_trades SET
                    timestamp_cierre = NOW(),
                    precio_cierre = ?,
                    ganancia_perdida = ?,
                    resultado = ?
                WHERE id = ?
            \`, [precioCierre, gananciaPerdida, resultado, trade.id]);

            logger.info(\`Trade \${trade.id} cerrado en BD: \${resultado} | PnL: \${gananciaPerdida.toFixed(2)} USDT\`);
        }
    } catch (e) {
        logger.error('Error en checkAndCloseTrades', e.message);
    }
}
`;

code = code.replace('async function executeTrade', closeCode + '\nasync function executeTrade');
code = code.replace('module.exports = { getPositions, getBalance, getTodayTrades, executeTrade, closeTrade, updateStopLoss, cancelOpenOrders, placeTrailingStop };', 'module.exports = { getPositions, getBalance, getTodayTrades, executeTrade, closeTrade, updateStopLoss, cancelOpenOrders, placeTrailingStop, checkAndCloseTrades };');
fs.writeFileSync('src/trader.js', code);
console.log('trader.js patched');

// Patch index.js
let idxCode = fs.readFileSync('index.js', 'utf8');
idxCode = idxCode.replace('async function runBot() {\n    try {', 'async function runBot() {\n    try {\n        await trader.checkAndCloseTrades();\n');
fs.writeFileSync('index.js', idxCode);
console.log('index.js patched');

// Patch dashboard.js
let dashCode = fs.readFileSync('dashboard.js', 'utf8');
// Problem 2
dashCode = dashCode.replace(/ accion/g, ' direccion as accion');
dashCode = dashCode.replace('cantidad, timestamp_apertura', 'capital_usado as cantidad, timestamp_apertura');
dashCode = dashCode.replace('accion as tipo', 'direccion as tipo');
dashCode = dashCode.replace('SUM(accion=', 'SUM(direccion=');
dashCode = dashCode.replace('SUM(accion=', 'SUM(direccion=');
dashCode = dashCode.replace('SUM(accion=', 'SUM(direccion=');
dashCode = dashCode.replace('SUM(accion=', 'SUM(direccion=');
dashCode = dashCode.replace("AND accion IN ('LONG','SHORT')", "AND direccion IN ('LONG','SHORT')");

// Problem 4
dashCode = dashCode.replace('bot_decisions WHERE DATE(fecha)', 'bot_decisions WHERE DATE(timestamp)');
dashCode = dashCode.replace('bot_decisions WHERE DATE(fecha)', 'bot_decisions WHERE DATE(timestamp)');
dashCode = dashCode.replace('ORDER BY fecha', 'ORDER BY timestamp');
dashCode = dashCode.replace('ORDER BY fecha', 'ORDER BY timestamp');

// Problem 5 & 3 - Needs custom logic added to getDashboardData
fs.writeFileSync('dashboard.js', dashCode);
console.log('dashboard.js patched initial');
