require('dotenv').config();
const cron = require('node-cron');
const logger = require('./src/logger');
const market = require('./src/market');
const indicators = require('./src/indicators');
const ai = require('./src/ai');
const risk = require('./src/risk');
const trader = require('./src/trader');

async function runBot() {
    try {
        const par = process.env.PAR;
        logger.info(`========================================`);
        logger.info(`Iniciando ciclo de analisis: ${par}`);

        // 1. Obtener velas de mercado
        const [candles15m, candles1h] = await Promise.all([
            market.getCandles15m(par),
            market.getCandles1h(par)
        ]);

        if (!candles15m || candles15m.length < 50) {
            logger.error('Velas 15m insuficientes. Abortando ciclo.');
            return;
        }

        // 2. Calcular indicadores tecnicos
        const indicators15m = indicators.calcularIndicadores(candles15m);
        let indicators1h;

        if (!candles1h || candles1h.length < 50) {
            logger.info('Velas 1h insuficientes. Usando 15m como fallback.');
            indicators1h = indicators15m;
        } else {
            indicators1h = indicators.calcularIndicadores(candles1h);
        }

        const precioActual = indicators15m.currentPrice;

        // 3. Obtener contexto completo de cuenta
        const [posicionesAbiertas, balance, historialHoy] = await Promise.all([
            trader.getPositions(par),
            trader.getBalance(),
            trader.getTodayTrades()
        ]);

        const isPositionOpen = posicionesAbiertas.length > 0;

        logger.info(`Balance: ${balance} USDT | Posiciones: ${posicionesAbiertas.length} | Precio: ${precioActual}`);

        // 4. Consultar IA con todo el contexto
        const decision = await ai.consultarGemini(
            indicators15m,
            indicators1h,
            precioActual,
            posicionesAbiertas,
            balance,
            historialHoy
        );

        if (!decision) {
            logger.error('IA no devolvio decision valida. Abortando ciclo.');
            return;
        }

        logger.info(`IA decide: ${decision.accion} | Confianza: ${decision.confianza} | Riesgo: ${decision.riesgo_pct}%`);
        logger.info(`Razon: ${decision.razon}`);

        if (decision.accion === 'MOVE_SL') {
            logger.info(`Nuevo SL propuesto: ${decision.nuevo_stop_loss}`);
        }

        // 5. Validar permisos de riesgo
        const riskResult = await risk.checkRiskPermissions(decision, isPositionOpen);

        // 6. Guardar decision en base de datos
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

        // 7. Ejecutar segun accion de la IA
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

// Cron cada 15 minutos
logger.info('Trading Bot v3.0 iniciado — IA con libertad total + MOVE_SL');
logger.info(`Par: ${process.env.PAR} | Modo: ${process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO'}`);

cron.schedule('*/15 * * * *', () => {
    runBot();
});

// Ejecutar inmediatamente al arrancar
runBot();
