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
        // BingX API limit 100
        const klines = await market.getKlines(par, timeframe, 100);
        if (!klines || klines.length === 0) {
            logger.error('No se obtuvieron klines de BingX');
            return;
        }

        // 2. Calcular indicadores
        const indics = indicators.analyze(klines);

        // Consultar posiciones abiertas (simulación o real dependiendo del bot)
        const positions = await trader.getPositions(par);
        const isOpen = positions.length > 0;

        // 3. Consultar IA
        const decision = await ai.getTradeDecision(indics, isOpen);
        if (!decision) return;

        logger.info(`🤖 Gemini dice: ${decision.accion} (confianza: ${decision.confianza})`);

        // Armar el log decision object 
        const decisionLog = {
            rsi: indics.rsi,
            ema20: indics.ema20,
            ema50: indics.ema50,
            macd: indics.macd,
            signal_macd: indics.signal,
            histogram: indics.histogram,
            volumenPct: indics.volumeVsAvg,
            precioActual: indics.currentPrice,
            accion: decision.accion,
            confianza: decision.confianza,
            razon: decision.razon,
            stop_loss: decision.stop_loss,
            take_profit: decision.take_profit
        };

        // Guardar decision
        await logger.logDecision(decisionLog);

        // 4. Validar riesgo
        const canTrade = await risk.checkRiskPermissions(decision, isOpen);

        // 5. Ejecutar Trade
        if (canTrade && decision.accion !== 'HOLD') {
            await trader.executeTrade(decision, indics.currentPrice);
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
