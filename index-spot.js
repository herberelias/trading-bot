require('dotenv').config();
const cron = require('node-cron');
const logger = require('./src/logger');
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
        logger.info(`[SPOT] Iniciando ciclo: ${par}`);

        // 1. Velas en paralelo
        const [candles15m, candles1h, candles4h] = await Promise.all([
            marketSpot.getCandles15mSpot(par),
            marketSpot.getCandles1hSpot(par),
            marketSpot.getCandles4hSpot(par)
        ]);

        if (!candles15m || candles15m.length < 50) {
            logger.error('[SPOT] Velas 15m insuficientes. Abortando.');
            return;
        }

        // 2. Indicadores
        const indicators15m = indicators.calcularIndicadores(candles15m);
        const indicators1h = (candles1h && candles1h.length >= 50)
            ? indicators.calcularIndicadores(candles1h) : indicators15m;
        const indicators4h = (candles4h && candles4h.length >= 50)
            ? indicators.calcularIndicadores(candles4h) : null;

        const precioActual = indicators15m.currentPrice;

        // 3. Contexto en paralelo
        const [balanceSpot, historialHoy, fearGreed, racha] = await Promise.all([
            traderSpot.getSpotBalance(),
            traderSpot.getTodayTradesSpot(),
            context.getFearAndGreed(),
            context.getRachaActual()
        ]);

        const tieneEth = balanceSpot.eth > 0.0001;

        // 4. Soporte/resistencia y sesion
        const soportesResistencias = candles1h && candles1h.length > 0
            ? context.calcularSoportesResistencias(candles1h, 50) : null;
        const sesionMercado = context.getSesionMercado();

        logger.info(`[SPOT] USDT: ${balanceSpot.usdt.toFixed(2)} | ETH: ${balanceSpot.eth.toFixed(6)} | Precio ETH: ${precioActual}`);
        logger.info(`[SPOT] Sesion: ${sesionMercado.sesion} | Fear&Greed: ${fearGreed ? fearGreed.value : 'N/A'}`);

        // 5. Consultar IA
        const decision = await aiSpot.consultarGeminiSpot(
            indicators15m, indicators1h, indicators4h,
            precioActual, balanceSpot, historialHoy,
            fearGreed, soportesResistencias, sesionMercado, racha
        );

        if (!decision) {
            logger.error('[SPOT] IA no devolvio decision. Abortando.');
            return;
        }

        logger.info(`[SPOT] IA decide: ${decision.accion} | Confianza: ${decision.confianza}`);
        logger.info(`[SPOT] Razon: ${decision.razon}`);

        // 6. Validar riesgo
        const riskResult = await riskSpot.checkRiskPermissionsSpot(decision, tieneEth);

        // 7. Guardar decision
        await logger.logDecisionSpot({
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

        // 8. Ejecutar
        if (riskResult.canTrade) {
            if (decision.accion === 'BUY') {
                logger.info(`[SPOT] Ejecutando BUY ${decision.capital_pct}% del USDT...`);
                await traderSpot.executeBuy(decision, precioActual);
            } else if (decision.accion === 'SELL') {
                logger.info(`[SPOT] Ejecutando SELL ${decision.sell_pct}% del ETH...`);
                await traderSpot.executeSell(decision, precioActual);
            }
        }

        logger.info(`[SPOT] Ciclo completado.`);
        logger.info(`========================================`);

    } catch (error) {
        logger.error('[SPOT] Error critico en ciclo', error);
    }
}

logger.info('Spot Bot v1.0 — ETH-USDT — IA con libertad total');
logger.info(`Par: ${process.env.PAR_SPOT} | Modo: ${process.env.MODO_REAL_SPOT === 'true' ? 'REAL' : 'SIMULADO'}`);

cron.schedule('*/15 * * * *', () => { runSpotBot(); });
runSpotBot();
