require('dotenv').config();
const logger = require('./logger');
const tracer = require('./trader');

async function checkRiskPermissions(decision, isPositionOpen) {
    const minConfidence = parseFloat(process.env.CONFIANZA_MINIMA);

    if (decision.accion === 'HOLD') {
        const msg = 'La decision es HOLD, no se toman acciones.';
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    if (decision.confianza < minConfidence) {
        const msg = `Confianza baja (${decision.confianza} < ${minConfidence}). Operación descartada.`;
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    if (isPositionOpen && (decision.accion === 'LONG' || decision.accion === 'SHORT')) {
        const msg = `Ya existe una posición abierta. No se abren nuevas posiciones.`;
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    // Pérdida máxima diaria (ejemplo conceptual para MySQL)
    // require('./db') y SELECT sum(pnl) FROM bot_trades WHERE date = CURDATE()
    logger.info(`Evaluación de riesgo completada, se permite la operación.`);
    return { canTrade: true, reason: null };
}

module.exports = { checkRiskPermissions };
