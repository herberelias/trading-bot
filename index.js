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
        const timeframe = process.env.TIMEFRAME;

        logger.info(`📊 Analizando ${par}...`);

        // 1. Obtener datos de mercado
        const candles15m = await market.getCandles15m(par);
        const candles1h = await market.getCandles1h(par);

        if (!candles15m || candles15m.length === 0 || !candles1h || candles1h.length === 0) {
            logger.error('No se obtuvieron klines de BingX');
            return;
        }

        // 2. Calcular indicadores
        const indicators15m = indicators.calcularIndicadores(candles15m);
        const indicators1h = indicators.calcularIndicadores(candles1h);

        // Consultar posiciones abiertas (simulación o real dependiendo del bot)
        const positions = await trader.getPositions(par);
        const isOpen = positions.length > 0;

        // 3. Consultar IA
        const precioActual = indicators15m.currentPrice;
        const decision = await ai.consultarGemini(indicators15m, indicators1h, precioActual, isOpen);
        if (!decision) return;

        logger.info(`🤖 Gemini dice: ${decision.accion} (confianza: ${decision.confianza})`);

        // 4. Validar riesgo primero para saber si se ejecuta o no
        const riskResult = await risk.checkRiskPermissions(decision, isOpen);

        // Armar el log decision object AHORA que tenemos la razón
        const decisionLog = {
            rsi: indicators15m.rsi,
            ema20: indicators15m.ema20,
            ema50: indicators15m.ema50,
            macd: indicators15m.macd,
            signal_macd: indicators15m.signal,
            histogram: indicators15m.histogram,
            volumenPct: indicators15m.volumeVsAvg,
            precioActual: precioActual,
            accion: decision.accion,
            confianza: decision.confianza,
            razon: decision.razon,
            stop_loss: decision.stop_loss,
            take_profit: decision.take_profit,
            ejecutado: riskResult.canTrade && decision.accion !== 'HOLD',
            motivo_no_ejecutado: riskResult.reason
        };

        // Guardar decision en MySQL (ahora sí completita)
        await logger.logDecision(decisionLog);

        // 5. Ejecutar Trade si todo fue aprobado
        if (riskResult.canTrade && decision.accion !== 'HOLD') {
            await trader.executeTrade(decision, precioActual);
        }

    } catch (error) {
        logger.error('Error en el ciclo del bot', error);
    }
}

// Iniciar cron cada 15 min ('*/15 * * * *')
logger.info('🚀 Trading Bot iniciado. Cron programado cada 15 minutos.');
cron.schedule('*/15 * * * *', () => {
    runBot();
});

// Run once immediately (optional, or just wait for cron)
// runBot();
