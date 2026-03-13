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
        logger.info(`[SPOT] Iniciando ciclo de Vigilancia Total (Scanner)`);

        // 0. Usuarios activos
        const [usuarios] = await db.execute('SELECT * FROM users WHERE activo = 1');
        if (usuarios.length === 0) return;

        // 1. Identificar todas las monedas que hay que vigilar (Watchlist + lo que tienen los usuarios)
        const scanList = new Set(WATCHLIST);
        const userBalancesMap = new Map(); // Para no repetir llamadas por usuario si tienen balances iguales (opcional)

        for (const user of usuarios) {
            try {
                const balances = await traderSpot.getFullSpotBalance(user);
                userBalancesMap.set(user.id, balances);
                
                balances.forEach(b => {
                    const amount = parseFloat(b.free);
                    if (amount > 0.0001 && b.asset !== 'USDT' && b.asset !== 'USDC') {
                        scanList.add(`${b.asset}-USDT`);
                    }
                });
            } catch (err) {
                logger.error(`[SPOT] Error obteniendo balances de ${user.nombre}:`, err.message);
            }
        }

        const finalScanList = Array.from(scanList);
        logger.info(`[SPOT] Escaneando portfolio completo: ${finalScanList.join(', ')}`);

        // 2. Escanear Mercado
        const candidatos = [];
        for (const symbol of finalScanList) {
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
            logger.error('[SPOT] No se pudieron obtener datos de mercado.');
            return;
        }

        // 3. IA elije compras SOLO de la Watchlist principal (Filtro anti-memecoins)
        const candidatosParaCompra = candidatos.filter(c => WATCHLIST.includes(c.symbol));
        const TrumpNews = "Donald Trump maintains a pro-crypto stance, crypto-friendly regulation is expected.";
        const evaluacion = await aiSpot.evaluarCandidatosSpot(candidatosParaCompra, TrumpNews);

        if (!evaluacion || !evaluacion.mejores_candidatos || evaluacion.mejores_candidatos.length === 0) {
            logger.error('[SPOT] IA no pudo elegir candidatos.');
            return;
        }

        const nombresMejores = evaluacion.mejores_candidatos.map(c => c.symbol);
        const mejoresCandidatos = candidatos.filter(c => nombresMejores.includes(c.symbol));
        
        logger.info(`[SPOT] IA SELECCIONÓ (${nombresMejores.length}): ${nombresMejores.join(', ')}`);

        // 3. Analisis global (Fear & Greed)
        const [fearGreed, sesionMercado] = await Promise.all([
            context.getFearAndGreed(),
            Promise.resolve(context.getSesionMercado())
        ]);

        // --- BUCLE POR USUARIO ---
        for (const user of usuarios) {
            try {
                logger.info(`[SPOT] ---- Procesando: ${user.nombre} ----`);

                // 1. Usar balances ya obtenidos
                const allBalances = userBalancesMap.get(user.id) || await traderSpot.getFullSpotBalance(user);
                const usdtBalance = parseFloat(allBalances.find(b => b.asset === 'USDT')?.free || 0);

                // 2. Identificar qué activos del escaneo tiene el usuario
                const heldAssets = allBalances
                    .filter(b => parseFloat(b.free) > 0.0001 && b.asset !== 'USDT' && b.asset !== 'USDC')
                    .map(b => `${b.asset}-USDT`);

                // 3. Monedas a evaluar: lo que ya tiene (esté o no en watchlist) + todas las recomendaciones de compra
                const targets = [...new Set([...heldAssets, ...nombresMejores])];
                
                for (const symbol of targets) {
                    const candidate = candidatos.find(c => c.symbol === symbol);
                    if (!candidate) continue;

                    const asset = symbol.split('-')[0];
                    const balanceAsset = parseFloat(allBalances.find(b => b.asset === asset)?.free || 0);
                    const tienePosicion = balanceAsset > 0.0001;

                    // Decisión individual para esta moneda
                    const decision = await aiSpot.consultarGeminiSpot(
                        candidate.indicators15m, candidate.indicators1h, null, candidate.indicators1d,
                        candidate.precioActual,
                        { usdt: usdtBalance, eth: balanceAsset },
                        [], // Historial simplificado
                        fearGreed, null, sesionMercado, 0, null, TrumpNews
                    );

                    if (!decision) continue;
                    decision.symbol = symbol;

                    logger.info(`[SPOT][${user.nombre}] Decision para ${symbol}: ${decision.accion}`);

                    // Guardar decisión para el dashboard (priorizamos la de compra si es de los mejores, o si es venta)
                    if (nombresMejores.includes(symbol) || decision.accion === 'SELL') {
                        await logger.logDecisionSpot({
                            user_id: user.id,
                            symbol: symbol,
                            rsi: candidate.indicators15m.rsi,
                            ema20: candidate.indicators15m.ema20,
                            ema50: candidate.indicators15m.ema50,
                            macd: candidate.indicators15m.macd,
                            volumenPct: candidate.indicators15m.volumeVsAvg,
                            precioActual: candidate.precioActual,
                            accion: decision.accion,
                            confianza: decision.confianza,
                            razon: decision.razon,
                            ejecutado: true
                        });
                    }

                    // Ejecución
                    // Ahora permite comprar CUALQUIERA de los mejores candidatos si no hay posición
                    if (decision.accion === 'BUY' && !tienePosicion && nombresMejores.includes(symbol)) {
                        await traderSpot.executeBuy(user, decision, candidate.precioActual);
                    } else if (decision.accion === 'SELL' && tienePosicion) {
                        await traderSpot.executeSell(user, decision, candidate.precioActual);
                    }
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
