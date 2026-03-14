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

const SPOT_MIN_USDT_TO_BUY = parseFloat(process.env.SPOT_MIN_USDT_TO_BUY || 10);
const SPOT_MIN_DROP_PCT_FOR_REBUY = parseFloat(process.env.SPOT_MIN_DROP_PCT_FOR_REBUY || 1.5);
const SPOT_MAX_BUY_RSI_1H = parseFloat(process.env.SPOT_MAX_BUY_RSI_1H || 68);
const SPOT_MAX_BUY_RSI_15M = parseFloat(process.env.SPOT_MAX_BUY_RSI_15M || 72);
const SPOT_MIN_PROFIT_PCT_FOR_SELL = parseFloat(process.env.SPOT_MIN_PROFIT_PCT_FOR_SELL || 1.0);
const SPOT_MAX_ACCEPTED_LOSS_PCT = parseFloat(process.env.SPOT_MAX_ACCEPTED_LOSS_PCT || 2.5);
const SPOT_TP_TIER1_PCT = parseFloat(process.env.SPOT_TP_TIER1_PCT || 2.0);
const SPOT_TP_TIER2_PCT = parseFloat(process.env.SPOT_TP_TIER2_PCT || 4.0);
const SPOT_TP_TIER3_PCT = parseFloat(process.env.SPOT_TP_TIER3_PCT || 6.0);
const SPOT_TP_SELL_TIER1 = parseFloat(process.env.SPOT_TP_SELL_TIER1 || 35);
const SPOT_TP_SELL_TIER2 = parseFloat(process.env.SPOT_TP_SELL_TIER2 || 60);
const SPOT_TP_SELL_TIER3 = parseFloat(process.env.SPOT_TP_SELL_TIER3 || 100);

async function runSpotBot() {
    try {
        logger.info(`========================================`);
        logger.info(`[SPOT] Iniciando ciclo de Descubrimiento IA (Scanner Dinámico)`);

        // 0. Usuarios activos
        const [usuarios] = await db.execute('SELECT * FROM users WHERE activo = 1');
        if (usuarios.length === 0) return;

        // 1. Descubrimiento Dinámico: Obtener las monedas con más volumen del mercado
        const topMercado = await marketSpot.getTopSymbolsSpot(35) || [];

        if (!topMercado || topMercado.length === 0) {
            logger.warn('[SPOT] No se pudo obtener el Top de mercado. Usando solo portfolio.');
        } else {
            logger.info(`[SPOT] Top mercado obtenido: ${topMercado.length} monedas.`);
        }

        const scanList = new Set(topMercado);
        const userBalancesMap = new Map();

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
        logger.info(`[SPOT] Escaneando portfolio completo (${finalScanList.length}): ${finalScanList.join(', ')}`);

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

        // 3. IA elije compras de la lista dinámica (Descubrimiento)
        const candidatesForDiscovery = candidatos.filter(c => topMercado.includes(c.symbol));
        const TrumpNews = "Donald Trump maintains a pro-crypto stance, crypto-friendly regulation is expected.";
        let evaluacion = await aiSpot.evaluarCandidatosSpot(candidatesForDiscovery, TrumpNews);

        if (!evaluacion || !evaluacion.mejores_candidatos) {
            logger.info('[SPOT] IA analizó el mercado y decidió no comprar nada en este ciclo (o respuesta inválida).');
            evaluacion = { mejores_candidatos: [] }; 
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
                let heldAssets = allBalances
                    .filter(b => parseFloat(b.free) > 0.0001 && b.asset !== 'USDT' && b.asset !== 'USDC')
                    .map(b => `${b.asset}-USDT`);

                // Si es simulado, también buscamos en la base de datos qué monedas 'posee'
                if (user.modo_real === 0) {
                    const [simulatedRows] = await db.execute(`
                        SELECT symbol, SUM(IF(accion='BUY', cantidad, -cantidad)) as total 
                        FROM spot_trades 
                        WHERE user_id = ? 
                        GROUP BY symbol HAVING total > 0.0001
                    `, [user.id]);
                    const simAssets = simulatedRows.map(r => r.symbol);
                    heldAssets = [...new Set([...heldAssets, ...simAssets])];
                }

                // 3. Monedas a evaluar: lo que ya tiene + las recomendaciones de la IA
                const targets = [...new Set([...heldAssets, ...nombresMejores])];
                
                let decisionLogueada = false;
                
                for (const symbol of targets) {
                    const candidate = candidatos.find(c => c.symbol === symbol);
                    if (!candidate) continue;

                    const asset = symbol.split('-')[0];
                    const balanceAsset = parseFloat(allBalances.find(b => b.asset === asset)?.free || 0);
                    
                    // Si el balance de la API es 0 pero está en heldAssets (caso simulado), 
                    // necesitamos simular un balance para la IA
                    let effectiveAssetBalance = balanceAsset;
                    if (user.modo_real === 0 && balanceAsset <= 0.0001) {
                         const [balRow] = await db.execute(`
                            SELECT SUM(IF(accion='BUY', cantidad, -cantidad)) as total 
                            FROM spot_trades 
                            WHERE user_id = ? AND symbol = ?
                        `, [user.id, symbol]);
                        effectiveAssetBalance = parseFloat(balRow[0]?.total || 0);
                    }

                    const tienePosicion = effectiveAssetBalance > 0.0001;

                    // Obtener precio de entrada para que la IA sepa cuándo vender (Profit 3% - 5%)
                    const lastBuy = await traderSpot.getUltimaCompra(user.id, symbol);
                    const entryPrice = lastBuy ? lastBuy.precio : null;

                    // Decisión individual para esta moneda
                    const decision = await aiSpot.consultarGeminiSpot(
                        candidate.indicators15m, candidate.indicators1h, null, candidate.indicators1d,
                        candidate.precioActual,
                        { usdt: usdtBalance, eth: effectiveAssetBalance },
                        [], // Historial simplificado
                        fearGreed, null, sesionMercado, 0, entryPrice, TrumpNews
                    );

                    if (!decision) continue;
                    decision.symbol = symbol;

                    logger.info(`[SPOT][${user.nombre}] Decision para ${symbol}: ${decision.accion}`);

                    // Guardrails de ejecucion: IA + riesgo + reglas cuantitativas.
                    const riskResult = await riskSpot.checkRiskPermissionsSpot(decision, tienePosicion, user, symbol);
                    let canExecute = riskResult.canTrade;
                    let blockReason = riskResult.reason || null;

                    const rsi1h = parseFloat(candidate.indicators1h?.rsi || 50);
                    const rsi15m = parseFloat(candidate.indicators15m?.rsi || 50);

                    if (canExecute && decision.accion === 'BUY') {
                        if (!nombresMejores.includes(symbol)) {
                            canExecute = false;
                            blockReason = 'BUY fuera de la seleccion principal del scanner.';
                        } else if (tienePosicion) {
                            canExecute = false;
                            blockReason = `Ya existe posicion en ${symbol}.`;
                        } else if (usdtBalance < SPOT_MIN_USDT_TO_BUY) {
                            canExecute = false;
                            blockReason = `USDT insuficiente (${usdtBalance.toFixed(2)} < ${SPOT_MIN_USDT_TO_BUY}).`;
                        } else if (rsi1h > SPOT_MAX_BUY_RSI_1H || rsi15m > SPOT_MAX_BUY_RSI_15M) {
                            canExecute = false;
                            blockReason = `RSI alto para compra (1h=${rsi1h.toFixed(1)}, 15m=${rsi15m.toFixed(1)}).`;
                        } else if (entryPrice) {
                            const dropPct = ((entryPrice - candidate.precioActual) / entryPrice) * 100;
                            if (dropPct < SPOT_MIN_DROP_PCT_FOR_REBUY) {
                                canExecute = false;
                                blockReason = `Recompra bloqueada: caida ${dropPct.toFixed(2)}% < ${SPOT_MIN_DROP_PCT_FOR_REBUY}%.`;
                            }
                        }
                    }

                    if (canExecute && decision.accion === 'SELL' && tienePosicion && entryPrice) {
                        const pnlPct = ((candidate.precioActual - entryPrice) / entryPrice) * 100;
                        if (pnlPct < SPOT_MIN_PROFIT_PCT_FOR_SELL && pnlPct > (-SPOT_MAX_ACCEPTED_LOSS_PCT)) {
                            canExecute = false;
                            blockReason = `SELL bloqueado: PnL ${pnlPct.toFixed(2)}% sin take-profit ni stop-loss de proteccion.`;
                        } else {
                            // Escalonado de toma de ganancias: vende parcial en ganancias medias y total en ganancias altas.
                            let tierSellPct = SPOT_TP_SELL_TIER1;
                            if (pnlPct >= SPOT_TP_TIER3_PCT) tierSellPct = SPOT_TP_SELL_TIER3;
                            else if (pnlPct >= SPOT_TP_TIER2_PCT) tierSellPct = SPOT_TP_SELL_TIER2;
                            else if (pnlPct >= SPOT_TP_TIER1_PCT) tierSellPct = SPOT_TP_SELL_TIER1;
                            else tierSellPct = Math.min(SPOT_TP_SELL_TIER1, 30);

                            decision.sell_pct = Math.min(Math.max(tierSellPct, 1), 100);
                            logger.info(
                                `[SPOT][${user.nombre}] ${symbol} SELL escalonado: PnL ${pnlPct.toFixed(2)}% -> sell_pct ${decision.sell_pct}%`
                            );
                        }
                    }

                    if (!canExecute && blockReason) {
                        logger.info(`[SPOT][${user.nombre}] ${symbol} BLOQUEADO: ${blockReason}`);
                    }

                    // Guardar decisión para el dashboard
                    // REGLA: Logueamos si es compra/venta, O si es el primero de la lista (para actualizar el tiempo en el dashboard)
                    const esRelevante = nombresMejores.includes(symbol) || decision.accion === 'SELL' || !decisionLogueada;
                    
                    if (esRelevante) {
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
                            razon: canExecute ? decision.razon : `${decision.razon} | BLOQUEADO: ${blockReason || 'Regla de ejecucion'}`,
                            ejecutado: canExecute,
                            motivo_no_ejecutado: canExecute ? null : blockReason
                        });
                        decisionLogueada = true;
                    }

                    // Ejecución
                    if (canExecute && decision.accion === 'BUY') {
                        await traderSpot.executeBuy(user, decision, candidate.precioActual);
                    } else if (canExecute && decision.accion === 'SELL' && tienePosicion) {
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

cron.schedule('*/15 * * * *', () => { runSpotBot(); });
runSpotBot();
