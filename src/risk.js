require('dotenv').config();
const logger = require('./logger');

async function checkRiskPermissions(decision, isPositionOpen, user = null) {
    const minConfidence = user ? parseFloat(user.confianza_minima) : (parseFloat(process.env.CONFIANZA_MINIMA) || 0.55);

    // Unico filtro: confianza minima
    if (decision.confianza < minConfidence) {
        const msg = `Confianza insuficiente (${decision.confianza} < ${minConfidence}). Descartado.`;
        logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
        return { canTrade: false, reason: msg };
    }

    // HOLD: la IA decidio no operar
    if (decision.accion === 'HOLD') {
        const msg = 'IA decide HOLD. Sin accion.';
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    // CLOSE: solo si hay posicion abierta
    if (decision.accion === 'CLOSE') {
        if (!isPositionOpen) {
            const msg = 'CLOSE solicitado pero no hay posicion abierta.';
            logger.info(msg);
            return { canTrade: false, reason: msg };
        }
        logger.info(`PERMITIDO: CLOSE con confianza ${decision.confianza}`);
        return { canTrade: true, reason: null };
    }

    // MOVE_SL: solo si hay posicion abierta
    if (decision.accion === 'MOVE_SL') {
        if (!isPositionOpen) {
            const msg = 'MOVE_SL solicitado pero no hay posicion abierta.';
            logger.info(msg);
            return { canTrade: false, reason: msg };
        }
        logger.info(`PERMITIDO: MOVE_SL a ${decision.nuevo_stop_loss} con confianza ${decision.confianza}`);
        return { canTrade: true, reason: null };
    }

    // LONG / SHORT: IA tiene libertad total, sin restriccion por posicion abierta
    logger.info(`PERMITIDO: ${decision.accion} | Confianza: ${decision.confianza} | Riesgo: ${decision.riesgo_pct}%`);
    return { canTrade: true, reason: null };
}

module.exports = { checkRiskPermissions };
