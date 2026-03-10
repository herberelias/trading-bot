require('dotenv').config();
const logger = require('./logger');

async function checkRiskPermissions(decision, isPositionOpen) {
    const minConfidence = parseFloat(process.env.CONFIANZA_MINIMA);

    // Confianza mínima siempre requerida
    if (decision.confianza < minConfidence) {
        const msg = `Confianza baja (${decision.confianza} < ${minConfidence}). Descartado.`;
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    // CLOSE: permitido si hay posición abierta
    if (decision.accion === 'CLOSE') {
        if (!isPositionOpen) {
            const msg = 'CLOSE solicitado pero no hay posición abierta.';
            logger.info(msg);
            return { canTrade: false, reason: msg };
        }
        logger.info('✅ IA decide CLOSE. Cerrando posición.');
        return { canTrade: true, reason: null };
    }

    // HOLD: no operar
    if (decision.accion === 'HOLD') {
        const msg = 'IA decide HOLD. Sin cambios.';
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    // LONG / SHORT: la IA tiene libertad total
    logger.info(`✅ Permiso concedido: ${decision.accion} con confianza ${decision.confianza}`);
    return { canTrade: true, reason: null };
}

module.exports = { checkRiskPermissions };
