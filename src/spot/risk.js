require('dotenv').config();
const logger = require('../logger');

function confidencePct(confidence) {
    const value = parseFloat(confidence || 0);
    if (!Number.isFinite(value)) return '0.00';
    return (value <= 1 ? value * 100 : value).toFixed(2);
}

async function checkRiskPermissionsSpot(decision, hasPosition, user = null, symbol = null) {
    const asset = symbol ? symbol.split('-')[0] : 'activo';
    const minConfidence = user ? parseFloat(user.confianza_minima_spot || user.confianza_minima) : (parseFloat(process.env.CONFIANZA_MINIMA_SPOT) || 0.65);

    if (decision.confianza < minConfidence) {
        const msg = `[SPOT] Confianza insuficiente (${confidencePct(decision.confianza)}% < ${confidencePct(minConfidence)}%). Descartado.`;
        logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
        return { canTrade: false, reason: msg };
    }

    if (decision.accion === 'HOLD') {
        const msg = '[SPOT] IA decide HOLD. Sin accion.';
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    if (decision.accion === 'SELL' && !hasPosition) {
        const msg = `[SPOT] SELL solicitado pero no hay ${asset} disponible.`;
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    logger.info(`[SPOT] PERMITIDO: ${decision.accion} | Confianza: ${confidencePct(decision.confianza)}% | Capital: ${decision.capital_pct || decision.sell_pct}%`);
    return { canTrade: true, reason: null };
}

module.exports = { checkRiskPermissionsSpot };
