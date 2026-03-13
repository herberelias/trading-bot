require('dotenv').config();
const cron = require('node-cron');
const logger = require('./src/logger');
const db = require('./src/db');
const marketSpot = require('./src/spot/market');
const indicators = require('./src/indicators');
const aiSpot = require('./src/spot/ai');
const riskSpot = require('./src/spot/risk');
const traderSpot = require('./src/spot/trader');
const context = require('./src/context');

const WATCHLIST = ['ETH-USDT', 'BTC-USDT', 'SOL-USDT', 'NEAR-USDT', 'FET-USDT', 'LINK-USDT'];

async function runSpotBot() {
    try {
        logger.info(`========================================`);
        logger.info(`[SPOT] Iniciando ciclo multi-moneda (Scanner)`);

        // 0. Usuarios activos
        const [usuarios] = await db.execute('SELECT * FROM users WHERE activo = 1');
        if (usuarios.length === 0) return;

        // 1. Escanear Watchlist
        logger.info(`[SPOT] Escaneando: ${WATCHLIST.join(', ')}`);
        const candidatos = [];
        
        for (const symbol of WATCHLIST) {
            try {
                const [c15m, c1h, c4h, c1d] = await Promise.all([
                    marketSpot.getCandles15mSpot(symbol),
                    marketSpot.getCandles1hSpot(symbol),
                    marketSpot.getCandles4hSpot(symbol),
                    marketSpot.getCandles1dSpot(symbol)
                ]);

                if (!c15m || c15m.length < 50) continue;

                const ind15m = indicators.calcularIndicadores(c15m);
                const ind1h = (c1h && c1h.length >= 50) ? indicators.calcularIndicadores(c1h) : ind15m;
                const ind1d = (c1d && c1d.length >= 50) ? indicators.calcularIndicadores(c1d) : null;

                candidatos.push({
                    symbol,
                    precioActual: ind15m.currentPrice,
                    indicators15m: ind15m,
                    indicators1h: ind1h,
                    indicators1d: ind1d
                });
            } catch (err) {
                logger.error(`[SPOT] Error escaneando ${symbol}:`, err.message);
            }
        }

        if (candidatos.length === 0) {
            logger.error('[SPOT] No se pudieron obtener datos de ningun candidato.');
            return;
        }

        // 2. IA elije la mejor oportunidad
        const TrumpNews = "Donald Trump maintains a pro-crypto stance, favorable regulation and Bitcoin reserves are key topics.";
        const evaluacion = await aiSpot.evaluarCandidatosSpot(candidatos, TrumpNews);

        if (!evaluacion || !evaluacion.mejor_candidato) {
            logger.error('[SPOT] IA no pudo elegir un candidato.');
            return;
        }

        const mejor = candidatos.find(c => c.symbol === evaluacion.mejor_candidato);
        logger.info(`[SPOT] IA SELECCIONÓ: ${evaluacion.mejor_candidato} | Razon: ${evaluacion.razon}`);

        // 3. Analisis global (Fear & Greed)
        const [fearGreed, sesionMercado] = await Promise.all([
            context.getFearAndGreed(),
            Promise.resolve(context.getSesionMercado())
        ]);

        // --- BUCLE POR USUARIO ---
        for (const user of usuarios) {
            try {
                logger.info(`[SPOT] ---- Procesando: ${user.nombre} ----`);

                // Ver que moneda tiene este usuario (buscamos en balances reales)
                const assetHolding = mejor.symbol.split('-')[0];
                const balanceActivo = await traderSpot.getSpotBalance(user, assetHolding);
                const tienePosicion = balanceActivo.asset > 0.0001;

                // Decision individual para el mejor candidato
                const decision = await aiSpot.consultarGeminiSpot(
                    mejor.indicators15m, mejor.indicators1h, null, mejor.indicators1d,
                    mejor.precioActual, 
                    { usdt: balanceActivo.usdt, eth: balanceActivo.asset }, // Adaptamos para que el prompt funcione igual
                    [], // historial simplificado por ahora
                    fearGreed, null, sesionMercado, 0, null, TrumpNews
                );

                if (!decision) continue;
                decision.symbol = mejor.symbol; // Inyectamos el simbolo

                logger.info(`[SPOT][${user.nombre}] Decision para ${mejor.symbol}: ${decision.accion}`);

                // 4. Guardar decision para el dashboard
                await logger.logDecisionSpot({
                    user_id: user.id,
                    symbol: mejor.symbol,
                    rsi: mejor.indicators15m.rsi,
                    ema20: mejor.indicators15m.ema20,
                    ema50: mejor.indicators15m.ema50,
                    macd: mejor.indicators15m.macd,
                    volumenPct: mejor.indicators15m.volumeVsAvg,
                    precioActual: mejor.precioActual,
                    accion: decision.accion,
                    confianza: decision.confianza,
                    razon: decision.razon,
                    ejecutado: true
                });

                // 5. Ejecucion
                if (decision.accion === 'BUY' && !tienePosicion) {
                    await traderSpot.executeBuy(user, decision, mejor.precioActual);
                } else if (decision.accion === 'SELL' && tienePosicion) {
                    await traderSpot.executeSell(user, decision, mejor.precioActual);
                }

            } catch (uErr) {
                logger.error(`[SPOT] Error usuario ${user.nombre}:`, uErr.message);
            }
        }

        logger.info(`[SPOT] Ciclo completado.`);
        logger.info(`========================================`);

    } catch (error) {
        logger.error('[SPOT] Error critico', error);
    }
}

cron.schedule('*/30 * * * *', () => { runSpotBot(); });
runSpotBot();
