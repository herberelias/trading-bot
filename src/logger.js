const db = require('./db');
require('dotenv').config();

const logger = {
    info: (msg) => {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        console.log(`[${timestamp}] ${msg}`);
    },
    error: (msg, err) => {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        console.error(`[${timestamp}] ❌ ERROR: ${msg}`, err || '');
    },
    logDecision: async (decision) => {
        try {
            const query = `
                INSERT INTO bot_decisions (
                    par, timeframe, rsi, ema20, ema50, macd, signal_macd, histogram, 
                    volumen_vs_promedio, precio_actual, accion, confianza, razon, 
                    stop_loss, take_profit, modo_real, fecha
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            const values = [
                process.env.PAR, process.env.TIMEFRAME, decision.rsi, decision.ema20, decision.ema50,
                decision.macd, decision.signal_macd, decision.histogram, decision.volumenPct,
                decision.precioActual, decision.accion, decision.confianza, decision.razon,
                decision.stop_loss, decision.take_profit, process.env.MODO_REAL === 'true'
            ];
            await db.execute(query, values);
            logger.info(`💾 Decisión guardada en base de datos.`);
        } catch (error) {
            logger.error('No se pudo guardar la decisión en la BD', error);
        }
    },
    logTrade: async (trade) => {
        try {
            const query = `
                INSERT INTO bot_trades (
                    par, accion, cantidad, precio_entrada, stop_loss, take_profit, 
                    modo_real, fecha_entrada
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            const values = [
                process.env.PAR, trade.accion, trade.cantidad, trade.precio_entrada,
                trade.stop_loss, trade.take_profit, process.env.MODO_REAL === 'true'
            ];
            await db.execute(query, values);
            logger.info(`💾 Trade guardado en base de datos.`);
        } catch (error) {
            logger.error('No se pudo guardar el trade en la BD', error);
        }
    }
};

module.exports = logger;
