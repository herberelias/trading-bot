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

async function runSpotBot() {
    try {
        const par = process.env.PAR_SPOT;
        logger.info(`========================================`);
        logger.info(`[SPOT] Iniciando ciclo multiusuario: ${par}`);

        // 0. Obtener usuarios activos
        const [usuarios] = await db.execute('SELECT * FROM users WHERE activo = 1');
        if (usuarios.length === 0) {
            logger.warn('[SPOT] No hay usuarios activos. Saltando ciclo.');
            return;
        }

        // 1. Velas en paralelo (una vez para todos — el mercado es igual para todos)
        const [candles15m, candles1h, candles4h] = await Promise.all([
            marketSpot.getCandles15mSpot(par),
            marketSpot.getCandles1hSpot(par),
            marketSpot.getCandles4hSpot(par)
        ]);

        if (!candles15m || candles15m.length < 50) {
            logger.error('[SPOT] Velas 15m insuficientes. Abortando.');
            return;
        }

        // 2. Indicadores técnicos (iguales para todos — mismo activo ETH)
        const indicators15m = indicators.calcularIndicadores(candles15m);
        const indicators1h = (candles1h && candles1h.length >= 50)
            ? indicators.calcularIndicadores(candles1h) : indicators15m;
        const indicators4h = (candles4h && candles4h.length >= 50)
            ? indicators.calcularIndicadores(candles4h) : null;

        const precioActual = indicators15m.currentPrice;

        // 3. Contexto global (solo una vez)
        const [fearGreed, soportesResistencias, sesionMercado] = await Promise.all([
            context.getFearAndGreed(),
            candles1h && candles1h.length > 0 
                ? Promise.resolve(context.calcularSoportesResistencias(candles1h, 50)) 
                : Promise.resolve(null),
            Promise.resolve(context.getSesionMercado())
        ]);

        logger.info(`[SPOT] Precio ETH: ${precioActual} | Fear&Greed: ${fearGreed?.value || 'N/A'} | Sesion: ${sesionMercado?.sesion}`);

        // --- BUCLE POR USUARIO ---
        for (const user of usuarios) {
            try {
                logger.info(`[SPOT] ---- Procesando: ${user.nombre} (ID: ${user.id}) ----`);

                // Contexto específico del usuario (su balance, su historial)
                const [balanceSpot, historialHoy, racha, ultimaCompraPrecio] = await Promise.all([
                    traderSpot.getSpotBalance(user),
                    traderSpot.getTodayTradesSpot(user.id),
                    context.getRachaActual(user),
                    traderSpot.getUltimaCompra(user.id)
                ]);

                const tieneEth = balanceSpot.eth > 0.0001;

                logger.info(`[SPOT][${user.nombre}] USDT: ${balanceSpot.usdt?.toFixed(2)} | ETH: ${balanceSpot.eth?.toFixed(6)} | Tiene ETH: ${tieneEth}`);

                // 4. IA independiente para este usuario (con su capital real)
                const decision = await aiSpot.consultarGeminiSpot(
                    indicators15m, indicators1h, indicators4h,
                    precioActual, balanceSpot, historialHoy,
                    fearGreed, soportesResistencias, sesionMercado, racha, ultimaCompraPrecio
                );

                if (!decision) {
                    logger.error(`[SPOT][${user.nombre}] IA no devolvio decision. Saltando.`);
                    continue;
                }

                logger.info(`[SPOT][${user.nombre}] IA: ${decision.accion} | Confianza: ${decision.confianza}`);

                // 5. Validar riesgo
                const riskResult = await riskSpot.checkRiskPermissionsSpot(decision, tieneEth, user);

                // 6. Guardar decision CON user_id
                await logger.logDecisionSpot({
                    user_id: user.id,
                    rsi: indicators15m.rsi,
                    ema20: indicators15m.ema20,
                    ema50: indicators15m.ema50,
                    macd: indicators15m.macd,
                    volumenPct: indicators15m.volumeVsAvg,
                    precioActual,
                    accion: decision.accion,
                    confianza: decision.confianza,
                    razon: decision.razon,
                    precio_objetivo: decision.precio_objetivo,
                    stop_loss_ref: decision.stop_loss_ref,
                    ejecutado: riskResult.canTrade,
                    motivo_no_ejecutado: riskResult.reason
                });

                // 7. Ejecutar en la cuenta del usuario
                if (riskResult.canTrade) {
                    if (decision.accion === 'BUY') {
                        logger.info(`[SPOT][${user.nombre}] Ejecutando BUY ${decision.capital_pct}% USDT...`);
                        await traderSpot.executeBuy(user, decision, precioActual);
                    } else if (decision.accion === 'SELL') {
                        logger.info(`[SPOT][${user.nombre}] Ejecutando SELL ${decision.sell_pct}% ETH...`);
                        await traderSpot.executeSell(user, decision, precioActual);
                    }
                }

            } catch (uErr) {
                logger.error(`[SPOT] Error procesando usuario ${user.nombre}:`, uErr.message);
            }
        }

        logger.info(`[SPOT] Ciclo multiusuario completado.`);
        logger.info(`========================================`);

    } catch (error) {
        logger.error('[SPOT] Error critico en ciclo', error);
    }
}

logger.info('Spot Bot v2.0 — ETH-USDT — Multiusuario IA Independiente');
logger.info(`Par: ${process.env.PAR_SPOT} | Modo: ${process.env.MODO_REAL_SPOT === 'true' ? 'REAL' : 'SIMULADO'}`);

cron.schedule('*/15 * * * *', () => { runSpotBot(); });
runSpotBot();
