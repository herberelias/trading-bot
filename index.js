require('dotenv').config();
const cron = require('node-cron');
const logger = require('./src/logger');
const market = require('./src/market');
const indicators = require('./src/indicators');
const ai = require('./src/ai');
const risk = require('./src/risk');
const trader = require('./src/trader');
const context = require('./src/context');

async function runBot() {
    try {
        const par = process.env.PAR;
        logger.info(`========================================`);
        logger.info(`Iniciando ciclo: ${par} | ${new Date().toISOString()}`);

        // 1. Obtener velas de mercado (3 timeframes en paralelo)
        const [candles15m, candles1h, candles4h] = await Promise.all([
            market.getCandles15m(par),
            market.getCandles1h(par),
            market.getCandles4h(par)
        ]);

        if (!candles15m || candles15m.length < 50) {
            logger.error('Velas 15m insuficientes. Abortando.');
            return;
        }

        // 2. Calcular indicadores tecnicos
        const indicators15m = indicators.calcularIndicadores(candles15m);
        const indicators1h = (candles1h && candles1h.length >= 50)
            ? indicators.calcularIndicadores(candles1h)
            : indicators15m;
        const indicators4h = (candles4h && candles4h.length >= 50)
            ? indicators.calcularIndicadores(candles4h)
            : null;

        const precioActual = indicators15m.currentPrice;

        // 3. Recolectar todo el contexto en paralelo
        const [
            posicionesAbiertas,
            balance,
            historialHoy,
            fearGreed,
            fundingRate,
            racha
        ] = await Promise.all([
            trader.getPositions(par),
            trader.getBalance(),
            trader.getTodayTrades(),
            context.getFearAndGreed(),
            market.getFundingRate(par),
            context.getRachaActual()
        ]);

        const isPositionOpen = posicionesAbiertas.length > 0;

        // 4. Calcular soporte/resistencia con velas 1h
        const soportesResistencias = candles1h && candles1h.length > 0
            ? context.calcularSoportesResistencias(candles1h, 50)
            : null;

        // 5. Obtener sesion de mercado actual
        const sesionMercado = context.getSesionMercado();

        logger.info(`Balance: ${balance} USDT | Posiciones: ${posicionesAbiertas.length} | Precio: ${precioActual}`);
        logger.info(`Sesion: ${sesionMercado.sesion} | Fear&Greed: ${fearGreed ? fearGreed.value : 'N/A'} | Funding: ${fundingRate ? fundingRate.fundingRate : 'N/A'}%`);

        // 6. Consultar IA con contexto completo
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
            racha
        );

        if (!decision) {
            logger.error('IA no devolvio decision valida. Abortando.');
            return;
        }

        logger.info(`IA decide: ${decision.accion} | Confianza: ${decision.confianza} | Riesgo: ${decision.riesgo_pct}%`);
        logger.info(`Razon: ${decision.razon}`);
        if (decision.accion === 'MOVE_SL') {
            logger.info(`Nuevo SL: ${decision.nuevo_stop_loss}`);
        }

        // 7. Validar permisos de riesgo
        const riskResult = await risk.checkRiskPermissions(decision, isPositionOpen);

        // 8. Guardar decision en base de datos
        const decisionLog = {
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

        // 9. Ejecutar accion
        if (riskResult.canTrade) {
            if (decision.accion === 'CLOSE') {
                logger.info('Ejecutando CLOSE...');
                await trader.closeTrade(precioActual);

            } else if (decision.accion === 'MOVE_SL') {
                logger.info(`Ejecutando MOVE_SL a ${decision.nuevo_stop_loss}...`);
                await trader.updateStopLoss(decision.nuevo_stop_loss, precioActual);

            } else if (decision.accion === 'LONG' || decision.accion === 'SHORT') {
                logger.info(`Ejecutando ${decision.accion}...`);
                await trader.executeTrade(decision, precioActual);
            }
        }

        logger.info(`Ciclo completado.`);
        logger.info(`========================================`);

    } catch (error) {
        logger.error('Error critico en ciclo del bot', error);
    }
}

logger.info('Trading Bot v4.0 — Contexto completo para IA');
logger.info(`Par: ${process.env.PAR} | Modo: ${process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO'}`);

cron.schedule('*/15 * * * *', () => { runBot(); });
runBot();
