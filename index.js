require('dotenv').config();
const cron = require('node-cron');
const logger = require('./src/logger');
const market = require('./src/market');
const indicators = require('./src/indicators');
const ai = require('./src/ai');
const risk = require('./src/risk');
const trader = require('./src/trader');
const context = require('./src/context');
const db = require('./src/db'); // New dependency

function confidencePct(confidence) {
    const value = parseFloat(confidence || 0);
    if (!Number.isFinite(value)) return '0.00';
    return (value <= 1 ? value * 100 : value).toFixed(2);
}

async function runBot() {
    try {
        const par = process.env.PAR;
        logger.info(`========================================`);
        logger.info(`Iniciando ciclo multiusuario: ${par} | ${new Date().toISOString()}`);

        // 0. Obtener usuarios activos
        const [usuarios] = await db.execute('SELECT * FROM users WHERE activo = 1');
        if (usuarios.length === 0) {
            logger.warn('No hay usuarios activos en la BD. Saltando ciclo.');
            return;
        }
        logger.info(`Usuarios a procesar: ${usuarios.length}`);

        // 1. Obtener velas de mercado (Una vez para todos)
        const [candles15m, candles1h, candles4h] = await Promise.all([
            market.getCandles15m(par),
            market.getCandles1h(par),
            market.getCandles4h(par)
        ]);

        if (!candles15m || candles15m.length < 50) {
            logger.error('Velas 15m insuficientes. Abortando.');
            return;
        }

        // 2. Calcular indicadores tecnicos (Una vez para todos)
        const indicators15m = indicators.calcularIndicadores(candles15m);
        const indicators1h = (candles1h && candles1h.length >= 50)
            ? indicators.calcularIndicadores(candles1h)
            : indicators15m;
        const indicators4h = (candles4h && candles4h.length >= 50)
            ? indicators.calcularIndicadores(candles4h)
            : null;

        const precioActual = indicators15m.currentPrice;

        // 3. Obtener contexto global (Fear & Greed, Funding Rate)
        const [fearGreed, fundingRate] = await Promise.all([
            context.getFearAndGreed(),
            market.getFundingRate(par)
        ]);

        const soportesResistencias = candles1h && candles1h.length > 0
            ? context.calcularSoportesResistencias(candles1h, 50)
            : null;
        const sesionMercado = context.getSesionMercado();
        const TrumpNews = "Donald Trump maintains a strongly pro-crypto stance, establishing a Bitcoin reserve, signing the GENIUS Act for stablecoins, and opposing CBDCs. His administration promotes clear regulatory frameworks (Crypto Clarity Act) and a friendly environment for digital assets.";

        logger.info(`Precio: ${precioActual} | Fear: ${fearGreed?.value} | Funding: ${fundingRate?.fundingRate}%`);

        // --- BUCLE POR USUARIO ---
        for (const user of usuarios) {
            try {
                logger.info(`----------------------------------------`);
                logger.info(`Procesando usuario: ${user.nombre} (ID: ${user.id})`);

                // Sincronizar trades cerrados
                await trader.checkAndCloseTrades(user);

                // Obtener contexto especifico del usuario
                const [
                    posicionesAbiertas,
                    balance,
                    historialHoy,
                    racha
                ] = await Promise.all([
                    trader.getPositions(par, user),
                    trader.getBalance(user),
                    trader.getTodayTrades(user),
                    context.getRachaActual(user)
                ]);

                const isPositionOpen = posicionesAbiertas.length > 0;
                logger.info(`[${user.nombre}] Balance: ${balance} USDT | Posiciones: ${posicionesAbiertas.length}`);

                // 4. Consultar IA (Cada usuario podria tener un contexto distinto de trades previos)
                const decision = await ai.consultarGemini(
                    indicators15m,
                    indicators1h,
                    indicators4h,
                    precioActual,
                    posicionesAbiertas,
                    balance,
                    historialHoy,
                    fearGreed,
                    soportesResistencias,
                    sesionMercado,
                    fundingRate,
                    racha,
                    TrumpNews
                );

                if (!decision) {
                    logger.error(`[${user.nombre}] IA no devolvio decision valida.`);
                    continue;
                }

                logger.info(`[${user.nombre}] IA: ${decision.accion} | Confianza: ${confidencePct(decision.confianza)}%`);

                // 5. Validar permisos de riesgo (Usando config de BD del usuario)
                const riskResult = await risk.checkRiskPermissions(decision, isPositionOpen, user, {
                    currentPrice: precioActual,
                    racha,
                    posicionesAbiertas
                });

                // 6. Guardar decision
                const decisionLog = {
                    user_id: user.id,
                    rsi: indicators15m.rsi,
                    ema20: indicators15m.ema20,
                    ema50: indicators15m.ema50,
                    macd: indicators15m.macd,
                    signal_macd: indicators15m.signal,
                    histogram: indicators15m.histogram,
                    volumenPct: indicators15m.volumeVsAvg,
                    precioActual,
                    accion: decision.accion,
                    confianza: decision.confianza,
                    razon: decision.razon,
                    stop_loss: decision.stop_loss || decision.nuevo_stop_loss || null,
                    take_profit: decision.take_profit || null,
                    ejecutado: riskResult.canTrade,
                    motivo_no_ejecutado: riskResult.reason
                };
                await logger.logDecision(decisionLog);

                // 7. Ejecutar accion
                if (riskResult.canTrade) {
                    if (decision.accion === 'CLOSE') {
                        logger.info(`[${user.nombre}] Ejecutando CLOSE...`);
                        await trader.cancelOpenOrders(user);
                        await trader.closeTrade(precioActual, user);
                    } else if (decision.accion === 'MOVE_SL') {
                        logger.info(`[${user.nombre}] Ejecutando MOVE_SL a ${decision.nuevo_stop_loss}...`);
                        await trader.cancelOpenOrders(user);
                        await trader.updateStopLoss(decision.nuevo_stop_loss, precioActual, user);
                    } else if (decision.accion === 'LONG' || decision.accion === 'SHORT') {
                        logger.info(`[${user.nombre}] Ejecutando ${decision.accion}...`);
                        await trader.executeTrade(decision, precioActual, user);
                    }
                }

            } catch (uErr) {
                logger.error(`Error procesando usuario ${user.nombre}:`, uErr);
            }
        }

        logger.info(`========================================`);
        logger.info(`Ciclo completado.`);

    } catch (error) {
        logger.error('Error critico en ciclo del bot', error);
    }
}

logger.info('Trading Bot v5.0 — Multicliente IA');
logger.info(`Par: ${process.env.PAR} | Modo: ${process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO'}`);

cron.schedule('*/15 * * * *', () => { runBot(); });
runBot();
