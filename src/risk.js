require('dotenv').config();
const logger = require('./logger');
const db = require('./db');

async function getTodayClosedPnl(user = null) {
    try {
        const userId = user ? user.id : 1;
        const modo = user ? (user.modo_real ? 'REAL' : 'SIMULADO') : (process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO');
        const [rows] = await db.execute(
            `SELECT COALESCE(SUM(ganancia_perdida), 0) as pnl
             FROM bot_trades
             WHERE user_id = ? AND modo = ? AND timestamp_cierre IS NOT NULL AND DATE(timestamp_cierre) = CURDATE()`,
            [userId, modo]
        );
        return parseFloat(rows[0]?.pnl || 0);
    } catch (e) {
        logger.error(`[${user?.nombre || 'Global'}] Error calculando PnL diario`, e.message);
        return 0;
    }
}

async function checkRiskPermissions(decision, isPositionOpen, user = null, context = {}) {
    const minConfidence = user ? parseFloat(user.confianza_minima) : (parseFloat(process.env.CONFIANZA_MINIMA) || 0.55);
    const action = decision?.accion;
    const currentPrice = parseFloat(context.currentPrice || 0);
    const cooldownAfterLossMin = parseFloat(process.env.FUTURES_COOLDOWN_AFTER_LOSS_MIN || 20);
    const allowAddPosition = process.env.FUTURES_ALLOW_ADD_POSITION === 'true';

    // Unico filtro: confianza minima
    if (decision.confianza < minConfidence) {
        const msg = `Confianza insuficiente (${decision.confianza} < ${minConfidence}). Descartado.`;
        logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
        return { canTrade: false, reason: msg };
    }

    if (!['LONG', 'SHORT', 'HOLD', 'CLOSE', 'MOVE_SL'].includes(action)) {
        const msg = `Accion invalida: ${action}`;
        logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
        return { canTrade: false, reason: msg };
    }

    // HOLD: la IA decidio no operar
    if (action === 'HOLD') {
        const msg = 'IA decide HOLD. Sin accion.';
        logger.info(msg);
        return { canTrade: false, reason: msg };
    }

    // CLOSE: solo si hay posicion abierta
    if (action === 'CLOSE') {
        if (!isPositionOpen) {
            const msg = 'CLOSE solicitado pero no hay posicion abierta.';
            logger.info(msg);
            return { canTrade: false, reason: msg };
        }
        logger.info(`PERMITIDO: CLOSE con confianza ${decision.confianza}`);
        return { canTrade: true, reason: null };
    }

    // MOVE_SL: solo si hay posicion abierta
    if (action === 'MOVE_SL') {
        if (!isPositionOpen) {
            const msg = 'MOVE_SL solicitado pero no hay posicion abierta.';
            logger.info(msg);
            return { canTrade: false, reason: msg };
        }
        logger.info(`PERMITIDO: MOVE_SL a ${decision.nuevo_stop_loss} con confianza ${decision.confianza}`);
        return { canTrade: true, reason: null };
    }

    // LONG / SHORT: reglas duras para reducir drawdown y entradas de baja calidad
    if (isPositionOpen && !allowAddPosition) {
        const msg = 'Ya hay una posicion abierta. Se bloquea nueva entrada para evitar sobreexposicion.';
        logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
        return { canTrade: false, reason: msg };
    }

    const perdidaMaxDiaria = user
        ? parseFloat(user.perdida_maxima_diaria || process.env.PERDIDA_MAXIMA_DIARIA || 0)
        : parseFloat(process.env.PERDIDA_MAXIMA_DIARIA || 0);
    if (perdidaMaxDiaria > 0) {
        const pnlHoy = await getTodayClosedPnl(user);
        if (pnlHoy <= -Math.abs(perdidaMaxDiaria)) {
            const msg = `Limite diario alcanzado: PnL hoy ${pnlHoy.toFixed(2)} USDT <= -${Math.abs(perdidaMaxDiaria)} USDT.`;
            logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
            return { canTrade: false, reason: msg };
        }
    }

    const ultimoCerrado = context?.racha?.ultimoCerrado;
    if (
        ultimoCerrado &&
        ultimoCerrado.resultado === 'LOSS' &&
        parseFloat(ultimoCerrado.cerradoHace || 9999) < cooldownAfterLossMin
    ) {
        const msg = `Cooldown tras LOSS activo (${ultimoCerrado.cerradoHace}m < ${cooldownAfterLossMin}m).`;
        logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
        return { canTrade: false, reason: msg };
    }

    if (currentPrice > 0) {
        const sl = parseFloat(decision.stop_loss);
        const tp = parseFloat(decision.take_profit);
        if (!Number.isFinite(sl) || !Number.isFinite(tp)) {
            const msg = 'SL/TP invalido para entrada LONG/SHORT.';
            logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
            return { canTrade: false, reason: msg };
        }

        if (action === 'LONG' && !(sl < currentPrice && tp > currentPrice)) {
            const msg = `LONG invalido: SL (${sl}) debe ser < precio (${currentPrice}) y TP (${tp}) > precio.`;
            logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
            return { canTrade: false, reason: msg };
        }
        if (action === 'SHORT' && !(sl > currentPrice && tp < currentPrice)) {
            const msg = `SHORT invalido: SL (${sl}) debe ser > precio (${currentPrice}) y TP (${tp}) < precio.`;
            logger.info(`[${user?.nombre || 'Global'}] BLOQUEADO: ${msg}`);
            return { canTrade: false, reason: msg };
        }
    }

    // LONG / SHORT: IA tiene libertad total, sin restriccion por posicion abierta
    logger.info(`PERMITIDO: ${decision.accion} | Confianza: ${decision.confianza} | Riesgo: ${decision.riesgo_pct}%`);
    return { canTrade: true, reason: null };
}

module.exports = { checkRiskPermissions };
