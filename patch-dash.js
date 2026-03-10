const fs = require('fs');

const code = fs.readFileSync('dashboard.js', 'utf8');

const sIdx = code.indexOf('async function getDashboardData() {');
const eIdx = code.indexOf('// ═══════════════════════════════════════════\r\n// RUTAS');
const eIdx2 = code.indexOf('// ═══════════════════════════════════════════\n// RUTAS');

const endIdx = eIdx !== -1 ? eIdx : eIdx2;

const newFunc = `async function getDashboardData() {
    try {
        const fmt = (d) => {
            if (!d) return 'N/A';
            return new Date(d).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
        };

        const traderFuturos = require('./src/trader');
        const traderSpot = require('./src/spot/trader');

        const [balanceFut, balSpot] = await Promise.all([
            traderFuturos.getBalance().catch(() => 0),
            traderSpot.getSpotBalance().catch(() => ({ usdt: 0, eth: 0 }))
        ]);

        let precioEth = 0;
        try {
            const marketSpot = require('./src/spot/market');
            precioEth = await marketSpot.getCurrentPrice('ETH-USDT');
        } catch(e) {}

        // Trades futuros hoy
        const [tradesFuturos] = await db.execute(\`
            SELECT par, direccion AS accion, precio_entrada, stop_loss, take_profit, capital_usado AS cantidad, timestamp_apertura
            FROM bot_trades WHERE DATE(timestamp_apertura) = CURDATE()
            ORDER BY timestamp_apertura DESC LIMIT 20
        \`);

        // Trades spot hoy
        const [tradesSpot] = await db.execute(\`
            SELECT par, accion, precio_entrada, capital_usdt, cantidad_eth, timestamp_apertura
            FROM spot_trades WHERE DATE(timestamp_apertura) = CURDATE()
            ORDER BY timestamp_apertura DESC LIMIT 20
        \`);

        // Posicion futuros
        const [posicion] = await db.execute(\`
            SELECT direccion as tipo, precio_entrada as entrada, stop_loss as sl,
                   take_profit as tp, capital_usado as qty
            FROM bot_trades WHERE DATE(timestamp_apertura) = CURDATE()
            AND timestamp_cierre IS NULL
            AND direccion IN ('LONG','SHORT') ORDER BY timestamp_apertura DESC LIMIT 1
        \`);

        // Ultima decision futuros
        const [decFuturos] = await db.execute(\`
            SELECT accion, confianza, razon, ejecutado FROM bot_decisions
            ORDER BY timestamp DESC LIMIT 1
        \`);

        // Ultima decision spot
        const [decSpot] = await db.execute(\`
            SELECT accion, confianza, razon, ejecutado FROM spot_decisions
            ORDER BY fecha DESC LIMIT 1
        \`);

        // Ultima compra ETH
        const [ultimaCompra] = await db.execute(\`
            SELECT precio_entrada FROM spot_trades WHERE accion = 'BUY'
            ORDER BY timestamp_apertura DESC LIMIT 1
        \`);

        // Stats futuros hoy
        const [sfHoy] = await db.execute(\`
            SELECT COUNT(*) as total,
                   SUM(direccion='LONG') as longs,
                   SUM(direccion='SHORT') as shorts
            FROM bot_trades WHERE DATE(timestamp_apertura) = CURDATE()
        \`);

        // Decisiones futuros hoy
        const [dfHoy] = await db.execute(\`
            SELECT COUNT(*) as total, SUM(ejecutado=1) as ejecutadas
            FROM bot_decisions WHERE DATE(timestamp) = CURDATE()
        \`);

        // Stats spot hoy
        const [ssHoy] = await db.execute(\`
            SELECT COUNT(*) as total,
                   SUM(accion='BUY') as buys,
                   SUM(accion='SELL') as sells
            FROM spot_trades WHERE DATE(timestamp_apertura) = CURDATE()
        \`);

        // Decisiones spot hoy
        const [dsHoy] = await db.execute(\`
            SELECT COUNT(*) as total, SUM(ejecutado=1) as ejecutadas
            FROM spot_decisions WHERE DATE(fecha) = CURDATE()
        \`);

        // Stats globales futuros
        const [sgFut] = await db.execute(\`
            SELECT COUNT(*) as total,
                   SUM(direccion='LONG') as longs,
                   SUM(direccion='SHORT') as shorts,
                   COUNT(DISTINCT DATE(timestamp_apertura)) as diasActivo
            FROM bot_trades
        \`);

        // Stats globales spot
        const [sgSpot] = await db.execute(\`
            SELECT COUNT(*) as total,
                   SUM(accion='BUY') as buys,
                   SUM(accion='SELL') as sells,
                   COUNT(DISTINCT DATE(timestamp_apertura)) as diasActivo
            FROM spot_trades
        \`);

        // WIN RATE REAL - PROBLEMA 5
        const [winData] = await db.execute(\`
            SELECT
                COUNT(*) as total,
                SUM(resultado = 'WIN') as ganados,
                SUM(resultado = 'LOSS') as perdidos,
                SUM(ganancia_perdida) as pnl_total
            FROM bot_trades
            WHERE timestamp_cierre IS NOT NULL
        \`);

        const winRateReal = winData[0].total > 0
            ? ((winData[0].ganados / winData[0].total) * 100).toFixed(0)
            : 0;

        // Formatear trades
        tradesFuturos.forEach(t => t.timestamp_apertura = fmt(t.timestamp_apertura));
        tradesSpot.forEach(t => {
            t.timestamp_apertura = fmt(t.timestamp_apertura);
            t.capital_usdt = parseFloat(t.capital_usdt || 0).toFixed(2);
            t.cantidad_eth = parseFloat(t.cantidad_eth || 0).toFixed(5);
            t.precio_entrada = parseFloat(t.precio_entrada || 0).toFixed(2);
        });

        // Combinar trades del día
        const todosHoy = [
            ...tradesFuturos.slice(0, 5).map(t => ({
                par: 'BTC-USDT', accion: t.accion,
                precio: t.precio_entrada, hora: t.timestamp_apertura,
                detalle: \`\${t.cantidad || '?'} BTC\`, bot: 'Futuros'
            })),
            ...tradesSpot.slice(0, 5).map(t => ({
                par: 'ETH-USDT', accion: t.accion,
                precio: t.precio_entrada, hora: t.timestamp_apertura,
                detalle: \`\${t.cantidad_eth} ETH\`, bot: 'Spot'
            }))
        ].sort((a, b) => b.hora.localeCompare(a.hora)).slice(0, 8);

        // Stats adicionales para dashboard
        const totalTrades = (parseInt(sgFut[0].total) || 0) + (parseInt(sgSpot[0].total) || 0);

        const sfTotal = parseInt(sfHoy[0].total) || 0;
        const dfTotal = parseInt(dfHoy[0]?.total) || 0;
        const dfEjec = parseInt(dfHoy[0]?.ejecutadas) || 0;

        const ssTotal = parseInt(ssHoy[0].total) || 0;
        const dsTotal = parseInt(dsHoy[0]?.total) || 0;
        const dsEjec = parseInt(dsHoy[0]?.ejecutadas) || 0;

        return {
            timestamp: new Date().toLocaleTimeString('es-SV'),
            balanceFuturos: balanceFut ? balanceFut.toFixed(2) : '0.00',
            balanceSpotUsdt: balSpot ? balSpot.usdt.toFixed(2) : '0.00',
            balanceSpotEth: balSpot ? balSpot.eth.toFixed(6) : '0.000000',
            valorEthUsdt: (balSpot && precioEth) ? (balSpot.eth * precioEth).toFixed(2) : '0.00',
            modoFuturos: process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO',
            modoSpot: process.env.MODO_REAL_SPOT === 'true' ? 'REAL' : 'SIMULADO',
            posicionFuturos: posicion[0] || null,
            tradesFuturos,
            tradesSpot,
            todosLosTradesHoy: todosHoy,
            ultimaDecisionFuturos: decFuturos[0] || null,
            ultimaDecisionSpot: decSpot[0] || null,
            ultimaCompraEth: ultimaCompra[0] ? parseFloat(ultimaCompra[0].precio_entrada).toFixed(2) : null,
            totalTradesToday: sfTotal + ssTotal,
            totalTrades,
            winRateGlobal: winRateReal, // Reemplazado por el calculo real de bd
            tasaEjecucionGlobal: dfTotal > 0 ? ((dfEjec / dfTotal) * 100).toFixed(0) : 0,
            statsFuturos: {
                total: sfTotal,
                longs: parseInt(sfHoy[0].longs) || 0,
                shorts: parseInt(sfHoy[0].shorts) || 0,
                decisiones: dfTotal,
                holds: dfTotal - dfEjec,
                winRate: dfTotal > 0 ? ((dfEjec / dfTotal) * 100).toFixed(0) : 0,
                tasaEjecucion: dfTotal > 0 ? ((dfEjec / dfTotal) * 100).toFixed(0) : 0,
                tradesCerrados: winData[0].total || 0,
                ganados: winData[0].ganados || 0,
                perdidos: winData[0].perdidos || 0,
                pnlTotal: parseFloat(winData[0].pnl_total || 0).toFixed(2)
            },
            statsSpot: {
                total: ssTotal,
                buys: parseInt(ssHoy[0].buys) || 0,
                sells: parseInt(ssHoy[0].sells) || 0,
                decisiones: dsTotal,
                holds: dsTotal - dsEjec,
                tasaEjecucion: dsTotal > 0 ? ((dsEjec / dsTotal) * 100).toFixed(0) : 0
            },
            statsGlobalFuturos: {
                total: parseInt(sgFut[0].total) || 0,
                longs: parseInt(sgFut[0].longs) || 0,
                shorts: parseInt(sgFut[0].shorts) || 0,
                diasActivo: parseInt(sgFut[0].diasActivo) || 0
            },
            statsGlobalSpot: {
                total: parseInt(sgSpot[0].total) || 0,
                buys: parseInt(sgSpot[0].buys) || 0,
                sells: parseInt(sgSpot[0].sells) || 0,
                diasActivo: parseInt(sgSpot[0].diasActivo) || 0
            }
        };
    } catch (error) {
        console.error('Error dashboard data:', error);
        return {
            timestamp: new Date().toLocaleTimeString('es-SV'),
            balanceFuturos: 'Error', balanceSpotUsdt: 'Error',
            balanceSpotEth: '0', valorEthUsdt: '0',
            modoFuturos: '?', modoSpot: '?',
            posicionFuturos: null, tradesFuturos: [], tradesSpot: [],
            todosLosTradesHoy: [], ultimaDecisionFuturos: null,
            ultimaDecisionSpot: null, ultimaCompraEth: null,
            totalTradesToday: 0, totalTrades: 0, winRateGlobal: 0,
            tasaEjecucionGlobal: 0,
            statsFuturos: { total:0, longs:0, shorts:0, decisiones:0, holds:0, winRate:0, tasaEjecucion:0, tradesCerrados:0, ganados:0, perdidos:0, pnlTotal:0 },
            statsSpot: { total:0, buys:0, sells:0, decisiones:0, holds:0, tasaEjecucion:0 },
            statsGlobalFuturos: { total:0, longs:0, shorts:0, diasActivo:0 },
            statsGlobalSpot: { total:0, buys:0, sells:0, diasActivo:0 }
        };
    }
}
`;

const finalCode = code.substring(0, sIdx) + newFunc + code.substring(endIdx);
fs.writeFileSync('dashboard.js', finalCode);

console.log('patched dashboard successfully');
