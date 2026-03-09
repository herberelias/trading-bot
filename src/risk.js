require('dotenv').config();
const logger = require('./logger');
const tracer = require('./trader');

async function checkRiskPermissions(decision, isPositionOpen) {
    const minConfidence = parseFloat(process.env.CONFIANZA_MINIMA);

    if (decision.accion === 'HOLD') {
        logger.info('La decision es HOLD, no se toman acciones.');
        return false;
    }

    if (decision.confianza < minConfidence) {
        logger.info(`Confianza baja (${decision.confianza} < ${minConfidence}). Operación descartada.`);
        return false;
    }

    if (isPositionOpen && (decision.accion === 'LONG' || decision.accion === 'SHORT')) {
        logger.info(`Ya existe una posición abierta. No se abren nuevas posiciones.`);
        return false;
    }

    // Pérdida máxima diaria (ejemplo conceptual para MySQL)
    // require('./db') y SELECT sum(pnl) FROM bot_trades WHERE date = CURDATE()
    logger.info(`Evaluación de riesgo completada, se permite la operación.`);
    return true;
}

module.exports = { checkRiskPermissions };
