const fs = require('fs');

try {
// Patch ai.js
let ai = fs.readFileSync('src/ai.js', 'utf8');
ai = ai.replace('"take_profit": precio numerico o null,', '"take_profit": precio numerico o null,\n  "trailing_pct": 0.5 a 3.0,');
ai = ai.replace('por que este riesgo_pct"', 'por que este riesgo_pct y trailing_pct"');
fs.writeFileSync('src/ai.js', ai);

// Patch trader.js
let trader = fs.readFileSync('src/trader.js', 'utf8');
const trailingFuncs = `
// NUEVA FUNCION: Cancelar ordenes abiertas (como trailing stops previos)
async function cancelOpenOrders() {
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
}

// NUEVA FUNCION: Colocar Trailing Stop
async function placeTrailingStop(side, trailingPct) {
    try {
        const symbol = process.env.PAR;
        const isReal = process.env.MODO_REAL === 'true';

        const callbackRate = Math.min(Math.max(parseFloat(trailingPct) || 1.0, 0.1), 5.0);

        if (!isReal) {
            logger.info(\`[SIMULADO] Trailing Stop \${side === 'LONG' ? 'SELL' : 'BUY'} | Callback: \${callbackRate}%\`);
            return { simulated: true };
        }

        const positions = await getPositions(symbol);
        const pos = positions.find(p => p.positionSide === side);
        if (!pos || parseFloat(pos.positionAmt) === 0) {
            logger.info('No hay posicion abierta para colocar trailing stop.');
            return null;
        }

        const qty = Math.abs(parseFloat(pos.positionAmt));
        const orderSide = side === 'LONG' ? 'SELL' : 'BUY';

        const params = {
            symbol,
            side: orderSide,
            positionSide: side,
            type: 'TRAILING_STOP_MARKET',
            quantity: qty,
            callbackRate: callbackRate,
            timestamp: Date.now()
        };

        const signature = getSignature(params);
        const queryString = Object.keys(params)
            .sort()
            .map(key => \`\${key}=\${encodeURIComponent(params[key])}\`)
            .join('&') + \`&signature=\${signature}\`;

        const url = \`\${BASE_URL}/openApi/swap/v2/trade/order?\${queryString}\`;
        const response = await axios({
            method: 'POST',
            url,
            headers: { 'X-BX-APIKEY': API_KEY }
        });

        if (response.data && response.data.code !== 0) {
            throw new Error(\`BingX Trailing Stop Error: \${response.data.msg} (Code: \${response.data.code})\`);
        }

        logger.info(\`✅ Trailing Stop colocado: \${orderSide} \${qty} BTC | Callback: \${callbackRate}%\`);
        return response.data;
    } catch (error) {
        logger.error('Error colocando Trailing Stop en BingX', error.response?.data || error.message);
        return null;
    }
}
`;

trader = trader.replace('async function executeTrade', trailingFuncs + '\nasync function executeTrade');
trader = trader.replace('module.exports = { getPositions, getBalance, getTodayTrades, executeTrade, closeTrade, updateStopLoss };', 'module.exports = { getPositions, getBalance, getTodayTrades, executeTrade, closeTrade, updateStopLoss, cancelOpenOrders, placeTrailingStop };');
fs.writeFileSync('src/trader.js', trader);

// Patch index.js
let idx = fs.readFileSync('index.js', 'utf8');
idx = idx.replace('await trader.closeTrade(precioActual);', 'await trader.cancelOpenOrders();\n                await trader.closeTrade(precioActual);');
idx = idx.replace('await trader.updateStopLoss(decision.nuevo_stop_loss, precioActual);', 'await trader.cancelOpenOrders();\n                await trader.updateStopLoss(decision.nuevo_stop_loss, precioActual);\n                if (decision.trailing_pct) {\n                    await new Promise(r => setTimeout(r, 1500));\n                    const pos = posicionesAbiertas.find(p => p.positionSide === "LONG" || p.positionSide === "SHORT");\n                    if (pos) await trader.placeTrailingStop(pos.positionSide, decision.trailing_pct);\n                }');
idx = idx.replace('await trader.executeTrade(decision, precioActual);', 'await trader.executeTrade(decision, precioActual);\n                const trailingPct = parseFloat(decision.trailing_pct) || 1.0;\n                logger.info(`Colocando Trailing Stop: ${trailingPct}%...`);\n                await new Promise(r => setTimeout(r, 2000));\n                await trader.placeTrailingStop(decision.accion, trailingPct);');
fs.writeFileSync('index.js', idx);

// Patch logger.js
let log = fs.readFileSync('src/logger.js', 'utf8');
log = log.replace('capital_usado, apalancamiento, modo, timestamp_apertura', 'capital_usado, apalancamiento, modo, trailing_pct, timestamp_apertura');
log = log.replace(') VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
log = log.replace(/process\.env\.APALANCAMIENTO \|\| 1,\s*modo_str/, 'process.env.APALANCAMIENTO || 1,\n                modo_str,\n                trade.trailing_pct || null');
fs.writeFileSync('src/logger.js', log);


console.log('Patch complete.');
} catch (e) {
  console.error(e);
}
