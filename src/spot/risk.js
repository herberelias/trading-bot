require('dotenv').config();
const logger = require('../logger');

async function checkRiskPermissionsSpot(decision, tieneEth) {
    const minConfidence = parseFloat(process.env.CONFIANZA_MINIMA_SPOT) || 0.65;

    if (decision.confianza < minConfidence) {
        const msg = `[SPOT] Confianza insuficiente (${decision.confianza} < ${minConfidence}). Descartado.`;
        logger.info(`BLOQUEADO: ${msg}`);
        return { canTrade: false, reason: msg };
    }

    if (decision.accion === 'HOLD') {
        const msg = '[SPOT] IA decide HOLD. Sin accion.';
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    if (decision.accion === 'SELL' && !tieneEth) {
        const msg = '[SPOT] SELL solicitado pero no hay ETH disponible.';
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    logger.info(`[SPOT] PERMITIDO: ${decision.accion} | Confianza: ${decision.confianza} | Capital: ${decision.capital_pct || decision.sell_pct}%`);
    return { canTrade: true, reason: null };
}

module.exports = { checkRiskPermissionsSpot };
