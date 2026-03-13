const db = require('./db');
require('dotenv').config();

const logger = {
    info: (msg) => {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        console.log(`[${timestamp}] ${msg}`);
    },
    warn: (msg) => {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        console.warn(`[${timestamp}] ⚠️ WARN: ${msg}`);
    },
    error: (msg, err) => {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        console.error(`[${timestamp}] ❌ ERROR: ${msg}`, err || '');
    },
    logDecision: async (decision) => {
        try {
            const query = `
                INSERT INTO bot_decisions (
                    user_id, par, precio_actual, rsi, ema20, ema50, macd, 
                    volumen_ratio, accion, confianza, razon, 
                    stop_loss, take_profit, ejecutado, motivo_no_ejecutado,
                    timeframe, signal_macd, histogram, volumen_vs_promedio, 
                    fecha, modo_real
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
            `;
            const values = [
                decision.user_id || 1,
                process.env.PAR,
                decision.precioActual,
                decision.rsi,
                decision.ema20,
                decision.ema50,
                decision.macd,
                decision.volumenPct,
                decision.accion,
                decision.confianza,
                decision.razon,
                decision.stop_loss || null,
                decision.take_profit || null,
                decision.ejecutado ? 1 : 0,
                decision.motivo_no_ejecutado || null,
                process.env.TIMEFRAME,
                decision.signal_macd,
                decision.histogram,
                decision.volumenPct,
                process.env.MODO_REAL === 'true' ? 1 : 0
            ];
            await db.execute(query, values);
            logger.info(`[user:${decision.user_id || 1}] 💾 Decisión guardada en BD.`);
        } catch (error) {
            logger.error('No se pudo guardar la decisión en la BD', error);
        }
    },
    logTrade: async (trade) => {
        try {
            const query = `
                INSERT INTO bot_trades (
                    par, direccion, precio_entrada, stop_loss, take_profit, 
                    capital_usado, apalancamiento, modo, trailing_pct, timestamp_apertura
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            const modo_str = process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO';
            const values = [
                process.env.PAR,
                trade.accion,
                trade.precio_entrada,
                trade.stop_loss || null,
                trade.take_profit || null,
                trade.cantidad || 0,
                process.env.APALANCAMIENTO || 1,
                modo_str,
                trade.trailing_pct || null
            ];
            await db.execute(query, values);
            logger.info(`💾 Trade guardado en base de datos correctamente.`);
        } catch (error) {
            logger.error('No se pudo guardar el trade en la BD', error);
        }
    },

    logDecisionSpot: async (decision) => {
        try {
            const query = `
                INSERT INTO spot_decisions (
                    user_id, symbol, par, precio_actual, rsi, ema20, ema50, macd,
                    volumen_ratio, accion, confianza, razon,
                    precio_objetivo, stop_loss_ref, ejecutado,
                    motivo_no_ejecutado, fecha, modo_real
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
            `;
            const values = [
                decision.user_id || 1,
                decision.symbol || process.env.PAR_SPOT || 'ETH-USDT',
                decision.symbol || process.env.PAR_SPOT || 'ETH-USDT',
                decision.precioActual,
                decision.rsi,
                decision.ema20,
                decision.ema50,
                decision.macd,
                decision.volumenPct,
                decision.accion,
                decision.confianza,
                decision.razon,
                decision.precio_objetivo || null,
                decision.stop_loss_ref || null,
                decision.ejecutado ? 1 : 0,
                decision.motivo_no_ejecutado || null,
                process.env.MODO_REAL_SPOT === 'true' ? 1 : 0
            ];
            await db.execute(query, values);
            logger.info(`[SPOT user:${decision.user_id || 1}] Decision guardada en BD para ${decision.symbol || 'ETH-USDT'}.`);
        } catch (error) {
            logger.error('[SPOT] No se pudo guardar decision en BD', error);
        }
    },

    logTradeSpot: async (trade) => {
        try {
            const query = `
                INSERT INTO spot_trades (
                    par, accion, precio_entrada, precio_objetivo,
                    stop_loss_ref, capital_usdt, cantidad_eth,
                    modo, timestamp_apertura
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            const modo_str = process.env.MODO_REAL_SPOT === 'true' ? 'REAL' : 'SIMULADO';
            const values = [
                process.env.PAR_SPOT,
                trade.accion,
                trade.precio_entrada,
                trade.precio_objetivo || null,
                trade.stop_loss_ref || null,
                trade.capital_usdt || 0,
                trade.cantidad_eth || 0,
                modo_str
            ];
            await db.execute(query, values);
            logger.info(`[SPOT] Trade guardado en base de datos.`);
        } catch (error) {
            logger.error('[SPOT] No se pudo guardar trade en BD', error);
        }
    }
};

module.exports = logger;
