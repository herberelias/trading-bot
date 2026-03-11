require('dotenv').config();
const logger = require('./logger');
const db = require('./db');
const crypto = require('crypto');
const axios = require('axios');

const BASE_URL = 'https://open-api.bingx.com';

/**
 * Genera la firma para BingX usando las llaves del usuario o del .env
 */
function getSignature(params, secret) {
    const query = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHmac('sha256', secret || process.env.BINGX_SECRET).update(query).digest('hex');
}

/**
 * Helper para peticiones a BingX
 */
async function request(method, path, params = {}, user = null) {
    const api_key = user ? user.bingx_key : process.env.BINGX_API_KEY;
    const secret = user ? user.bingx_secret : process.env.BINGX_SECRET;
    
    params.timestamp = Date.now();
    const signature = getSignature(params, secret);
    const queryString = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&') + `&signature=${signature}`;
    const url = `${BASE_URL}${path}?${queryString}`;
    
    try {
        const response = await axios({ method, url, headers: { 'X-BX-APIKEY': api_key } });
        const res = response.data;
        if (res && res.code !== 0) {
            throw new Error(`BingX API Error [${path}]: ${res.msg} (Code: ${res.code})`);
        }
        return res;
    } catch (error) {
        throw error;
    }
}

async function getBalance(user = null) {
    try {
        const res = await request('GET', '/openApi/swap/v2/user/balance', {}, user);
        if (res && res.data && res.data.balance) {
            const balanceObj = Array.isArray(res.data.balance) ? res.data.balance[0] : res.data.balance;
            const saldo = balanceObj.balance || balanceObj.equity || balanceObj.availableMargin;
            if (saldo !== undefined) return parseFloat(saldo);
        }
        logger.error(`[${user?.nombre || 'Global'}] Estructura de balance inesperada:`, JSON.stringify(res));
        return 0;
    } catch (e) {
        logger.error(`[${user?.nombre || 'Global'}] Error al obtener balance:`, e.message);
        return 0;
    }
}

async function getPositions(symbol, user = null) {
    try {
        const res = await request('GET', '/openApi/swap/v2/user/positions', { symbol }, user);
        let rawPositions = [];
        if (res && res.data) {
            if (Array.isArray(res.data)) rawPositions = res.data;
            else if (res.data.positions && Array.isArray(res.data.positions)) rawPositions = res.data.positions;
        }
        const positions = rawPositions.filter(p => p && parseFloat(p.positionAmt || 0) !== 0);

        // Fetch duration for Time-Stop analysis (This part was removed in the provided edit, but keeping it for context if needed)
        // const mode = user ? (user.modo_real ? 'REAL' : 'SIMULADO') : (process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO');
        // const [openTrades] = await db.execute("SELECT direccion, timestamp_apertura FROM bot_trades WHERE timestamp_cierre IS NULL AND modo = ? AND user_id = ?", [mode, user?.id || 1]);

        // Enriquecer con precio de liquidacion estimado si no viene en la respuesta
        const apalancamiento = user ? user.apalancamiento : (parseFloat(process.env.APALANCAMIENTO) || 10);

        return positions.map(p => {
            // BingX generalmente incluye liquidationPrice en la respuesta
            // Si no viene, lo estimamos: para LONG = entrada * (1 - 1/apalancamiento + 0.004)
            const entrada = parseFloat(p.avgPrice || 0);

            let liquidationEstimada = p.liquidationPrice;
            if (!liquidationEstimada || parseFloat(liquidationEstimada) === 0) {
                if (p.positionSide === 'LONG') {
                    liquidationEstimada = (entrada * (1 - (1 / apalancamiento) + 0.004)).toFixed(2);
                } else {
                    liquidationEstimada = (entrada * (1 + (1 / apalancamiento) - 0.004)).toFixed(2);
                }
            }

            // Calcular distancia al precio de liquidacion como porcentaje
            const precioActualEst = entrada; // aproximacion
            const distLiqPct = entrada > 0
                ? Math.abs(((parseFloat(liquidationEstimada) - entrada) / entrada) * 100).toFixed(2)
                : 'N/A';

            return {
                ...p,
                liquidationPrice: liquidationEstimada,
                distanciaLiquidacion: `${distLiqPct}%`
            };
        });
    } catch (e) {
        logger.error(`[${user?.nombre || 'Global'}] Error al obtener posiciones:`, e.message);
        return [];
    }
}

async function getTodayTrades(user = null) {
    try {
        const userId = user ? user.id : 1;
        const query = `
            SELECT direccion AS accion, precio_entrada, stop_loss, take_profit, capital_usado, timestamp_apertura
            FROM bot_trades
            WHERE DATE(timestamp_apertura) = CURDATE() AND user_id = ?
            ORDER BY timestamp_apertura DESC
            LIMIT 20
        `;
        const [rows] = await db.execute(query, [userId]);
        return rows;
    } catch (e) {
        logger.error(`[${user?.nombre || 'Global'}] Error al obtener historial de hoy:`, e.message);
        return [];
    }
}

async function placeOrder(orderParams, user = null) {
    try {
        const res = await request('POST', '/openApi/swap/v2/trade/order', orderParams, user);
        if (res && res.code !== 0) {
            throw new Error(`BingX API Error: ${res.msg || JSON.stringify(res)} (Code: ${res.code})`);
        }
        return res;
    } catch (e) {
        logger.error(`[${user?.nombre || 'Global'}] Error al ejecutar orden`, e.response?.data || e.message);
        throw e;
    }
}

// NUEVA FUNCION: Cerrar todas las posiciones abiertas
async function closeTrade(currentPrice, user = null) {
    const isReal = user ? user.modo_real : (process.env.MODO_REAL === 'true');
    const symbol = process.env.PAR || 'BTC-USDT';

    if (!isReal) {
        logger.info(`[${user?.nombre || 'SIMULADO'}] Cerrando posicion en precio ${currentPrice}`);
        await logger.logTrade({ 
            user_id: user?.id || 1,
            accion: 'CLOSE', 
            cantidad: 0, 
            precio_entrada: currentPrice, 
            stop_loss: null, 
            take_profit: null, 
            modo_real: false 
        });
        return;
    }

    try {
        const positions = await getPositions(symbol, user);
        if (!positions || positions.length === 0) {
            logger.info(`[${user?.nombre || 'Global'}] No hay posiciones abiertas para cerrar.`);
            return;
        }

        for (const pos of positions) {
            const closeSide = pos.positionSide === 'LONG' ? 'SELL' : 'BUY';
            const qty = Math.abs(parseFloat(pos.positionAmt));
            if (qty <= 0) continue;

            logger.info(`[${user?.nombre || 'Global'}] Cerrando ${pos.positionSide}: qty=${qty}, entrada=${pos.avgPrice}, precio actual=${currentPrice}`);

            await placeOrder({
                symbol,
                side: closeSide,
                positionSide: pos.positionSide,
                type: 'MARKET',
                quantity: qty.toFixed(4)
            }, user);

            logger.info(`[${user?.nombre || 'Global'}] Posicion ${pos.positionSide} cerrada exitosamente.`);

            await logger.logTrade({
                user_id: user?.id || 1,
                accion: 'CLOSE',
                cantidad: qty,
                precio_entrada: currentPrice,
                stop_loss: null,
                take_profit: null,
                modo_real: true
            });
        }
    } catch (error) {
        logger.error(`[${user?.nombre || 'Global'}] Error al cerrar posicion`, error);
        throw error;
    }
}

// NUEVA FUNCION: Mover stop loss de posicion abierta

// Funcion para limpiar TODO (normal y gatillos) de forma garantizada en BingX
async function cleanAllOrders(symbol, user = null) {
    try {
        // A. Intento V2 Normal
        await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol }, user);
        
        // B. Intento V2 con type=2 (Wait trigger orders)
        try {
            await request('DELETE', '/openApi/swap/v2/trade/allOpenOrders', { symbol, type: 2 }, user);
        } catch(e) {}

        // C. Intento V1 (especifico para Stop Orders en versiones antiguas que aun viven)
        try {
            // BingX v1 tenia un endpoint especifico
            await request('DELETE', '/openApi/swap/v1/trade/cancelAllStopOrders', { symbol }, user);
        } catch(e) {}

        logger.info(`[${user?.nombre || 'Global'}] Limpieza universal de ordenes completada.`);
    } catch (error) {
        logger.error(`[${user?.nombre || 'Global'}] Error en limpieza universal:`, error.message);
    }
}

async function updateStopLoss(nuevoSL, currentPrice, user = null) {
    const isReal = user ? user.modo_real : (process.env.MODO_REAL === 'true');
    const symbol = process.env.PAR || 'BTC-USDT';

    if (!isReal) {
        logger.info(`[${user?.nombre || 'SIMULADO'}] Moviendo SL a ${nuevoSL} (precio actual: ${currentPrice})`);
        return;
    }

    try {
        const positions = await getPositions(symbol, user);
        if (!positions || positions.length === 0) {
            logger.info(`[${user?.nombre || 'Global'}] No hay posiciones para mover SL.`);
            return;
        }

        for (const pos of positions) {
            const positionSide = pos.positionSide;
            const slActual = parseFloat(pos.stopLoss || 0);

            // Validacion de seguridad: no empeorar el SL
            if (positionSide === 'LONG' && nuevoSL < slActual) {
                logger.info(`[${user?.nombre || 'Global'}] RECHAZADO: nuevo SL ${nuevoSL} es peor que actual ${slActual} para LONG`);
                continue;
            }
            if (positionSide === 'SHORT' && nuevoSL > slActual && slActual > 0) {
                logger.info(`[${user?.nombre || 'Global'}] RECHAZADO: nuevo SL ${nuevoSL} es peor que actual ${slActual} para SHORT`);
                continue;
            }

            let adjustedSL = parseFloat(nuevoSL);
            if (positionSide === 'LONG' && adjustedSL >= parseFloat(currentPrice)) {
                adjustedSL = parseFloat((currentPrice * 0.9995).toFixed(2));
                logger.info(`[${user?.nombre || 'Global'}] Ajustando SL a ${adjustedSL} (no puede ser >= precio actual ${currentPrice})`);
            }
            if (positionSide === 'SHORT' && adjustedSL <= parseFloat(currentPrice)) {
                adjustedSL = parseFloat((currentPrice * 1.0005).toFixed(2));
                logger.info(`[${user?.nombre || 'Global'}] Ajustando SL a ${adjustedSL} (no puede ser <= precio actual ${currentPrice})`);
            }

            logger.info(`[${user?.nombre || 'Global'}] Moviendo SL de posicion ${positionSide}: ${slActual} -> ${adjustedSL}`);

            // BingX: cancelar ordenes SL existentes y crear nueva
            // Primero cancelamos ordenes abiertas de tipo STOP_MARKET
            try {
                await cleanAllOrders(symbol, user);
                logger.info(`[${user?.nombre || 'Global'}] Ordenes abiertas canceladas para reemplazar SL.`);
            } catch (e) {
                logger.error(`[${user?.nombre || 'Global'}] No se pudieron cancelar ordenes previas`, e.message);
            }

            // Crear nuevo stop loss
            const closeSide = positionSide === 'LONG' ? 'SELL' : 'BUY';
            const qty = Math.abs(parseFloat(pos.positionAmt));

            await placeOrder({
                symbol,
                side: closeSide,
                positionSide,
                type: 'STOP_MARKET',
                quantity: qty.toFixed(4),
                stopPrice: adjustedSL,
                workingType: 'MARK_PRICE'
            }, user);

            logger.info(`[${user?.nombre || 'Global'}] SL actualizado exitosamente a ${adjustedSL} para posicion ${positionSide}`);
        }
    } catch (error) {
        logger.error(`[${user?.nombre || 'Global'}] Error al mover stop loss`, error);
        throw error;
    }
}


// NUEVA FUNCION: Cancelar ordenes abiertas (como trailing stops previos)
async function cancelOpenOrders(user = null) {
    const symbol = process.env.PAR || 'BTC-USDT';
    const isReal = user ? user.modo_real : (process.env.MODO_REAL === 'true');
    if (!isReal) return logger.info(`[${user?.nombre || 'SIMULADO'}] Cancelando ordenes`);
    await cleanAllOrders(symbol, user);
}

// NUEVA FUNCION: Colocar Trailing Stop
async function placeTrailingStop(side, trailingPct, user = null) {
    try {
        const symbol = process.env.PAR || 'BTC-USDT';
        const isReal = user ? user.modo_real : (process.env.MODO_REAL === 'true');

        const callbackRate = Math.min(Math.max(parseFloat(trailingPct) || 1.0, 0.1), 5.0);

        if (!isReal) {
            logger.info(`[${user?.nombre || 'SIMULADO'}] Trailing Stop ${side === 'LONG' ? 'SELL' : 'BUY'} | Callback: ${callbackRate}%`);
            return { simulated: true };
        }

        const positions = await getPositions(symbol, user);
        const pos = positions.find(p => p.positionSide === side);
        if (!pos || parseFloat(pos.positionAmt) === 0) {
            logger.info(`[${user?.nombre || 'Global'}] No hay posicion abierta para colocar trailing stop.`);
            return null;
        }

        const qty = Math.abs(parseFloat(pos.positionAmt));
        const orderSide = side === 'LONG' ? 'SELL' : 'BUY';

        // The original code had a manual request call here, but it should use the refactored `request` function.
        await request('POST', '/openApi/swap/v2/trade/order', {
            symbol,
            side: orderSide,
            positionSide: side,
            type: 'TRAILING_STOP_MARKET',
            quantity: qty,
            priceRate: callbackRate,
            workingType: 'MARK_PRICE'
        }, user);

        logger.info(`✅ [${user?.nombre || 'Global'}] Trailing Stop colocado: ${orderSide} ${qty} BTC | Callback: ${callbackRate}%`);
        return { success: true }; // Return a success indicator
    } catch (error) {
        logger.error(`[${user?.nombre || 'Global'}] Error colocando Trailing Stop en BingX`, error.response?.data || error.message);
        return null;
    }
}


// NUEVA FUNCION: Revisar trades en BD y cerrarlos si ya no existen en BingX
async function checkAndCloseTrades(user = null) {
    try {
        const symbol = process.env.PAR || 'BTC-USDT';
        const userId = user ? user.id : 1;
        const modo = user ? (user.modo_real ? 'REAL' : 'SIMULADO') : (process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO');

        const [openTrades] = await db.execute(`
            SELECT id, direccion as accion, capital_usado, precio_entrada, apalancamiento 
            FROM bot_trades 
            WHERE timestamp_cierre IS NULL AND modo = ? AND user_id = ?
        `, [modo, userId]);

        if (openTrades.length === 0) return;

        let activePositions = [];
        if (modo === 'REAL') {
            const positions = await getPositions(symbol, user);
            activePositions = positions.filter(p => p && (p.positionSide === 'LONG' || p.positionSide === 'SHORT'));
        }

        let recentOrders = [];
        if (modo === 'REAL') {
            try {
                const resOrders = await request('GET', '/openApi/swap/v2/trade/allFillOrders', { symbol, limit: 100 }, user);
                if (resOrders && resOrders.data) {
                    if (Array.isArray(resOrders.data)) {
                        recentOrders = resOrders.data;
                    } else if (resOrders.data.orders && Array.isArray(resOrders.data.orders)) {
                        recentOrders = resOrders.data.orders;
                    } else if (resOrders.data.list && Array.isArray(resOrders.data.list)) {
                        recentOrders = resOrders.data.list;
                    }
                }
            } catch(e) {
                logger.error(`[${user?.nombre || 'Global'}] Error obteniendo allFillOrders de BingX:`, e.message);
            }
        }

        // Asegurar que recentOrders sea un array antes del loop
        if (!Array.isArray(recentOrders)) recentOrders = [];

        for (const trade of openTrades) {
            if (modo !== 'REAL') continue;

            const isOpen = Array.isArray(activePositions) && activePositions.some(p => p && p.positionSide === trade.accion);
            if (isOpen) continue;

            logger.info(`[${user?.nombre || 'Global'}] Verificando cierre de trade ID ${trade.id} (${trade.accion})...`);

            const closeSide = trade.accion === 'LONG' ? 'SELL' : 'BUY';
            const filledOrder = recentOrders.find(o => o.side === closeSide && parseFloat(o.price) > 0);
            
            let precioCierre = filledOrder ? parseFloat(filledOrder.price) : null;
            let comision = filledOrder ? Math.abs(parseFloat(filledOrder.commission || 0)) : 0;
            
            if (!precioCierre) {
                try {
                    const marketRes = await request('GET', '/openApi/swap/v2/quote/ticker', { symbol }, user);
                    if(marketRes.data && marketRes.data.lastPrice) {
                        precioCierre = parseFloat(marketRes.data.lastPrice);
                    }
                } catch(e) {}
            }

            if (!precioCierre) precioCierre = trade.precio_entrada; // fallback fallback

            const capital = parseFloat(trade.capital_usado);
            const entrada = parseFloat(trade.precio_entrada);
            const apalancamiento = parseFloat(trade.apalancamiento) || 10;
            
            let gananciaPerdida = 0;
            if (trade.accion === 'LONG') {
                gananciaPerdida = ((precioCierre - entrada) / entrada) * capital * apalancamiento;
            } else {
                gananciaPerdida = ((entrada - precioCierre) / entrada) * capital * apalancamiento;
            }

            const resultado = gananciaPerdida > 0 ? 'WIN' : 'LOSS';

            await db.execute(`
                UPDATE bot_trades SET
                    timestamp_cierre = NOW(),
                    precio_cierre = ?,
                    ganancia_perdida = ?,
                    comision = ?,
                    resultado = ?
                WHERE id = ?
            `, [precioCierre, gananciaPerdida, comision, resultado, trade.id]);

            logger.info(`[${user?.nombre || 'Global'}] Trade ${trade.id} cerrado en BD: ${resultado} | PnL: ${gananciaPerdida.toFixed(2)} USDT`);
        }
    } catch (e) {
        logger.error(`[${user?.nombre || 'Global'}] Error en checkAndCloseTrades`, e.message);
    }
}

async function executeTrade(decision, currentPrice, user = null) {
    const isReal = user ? user.modo_real : (process.env.MODO_REAL === 'true');
    const apalancamiento = user ? user.apalancamiento : (parseFloat(process.env.APALANCAMIENTO) || 10);
    const riesgo_pct = user ? user.riesgo_por_trade : (parseFloat(process.env.RIESGO_POR_TRADE) || 1);
    const userId = user ? user.id : 1;

    if (!isReal) {
        logger.info(`[${user?.nombre || 'SIMULADO'}] ${decision.accion} | Riesgo: ${riesgo_pct}% | SL: ${decision.stop_loss} | TP: ${decision.take_profit}`);
        await logger.logTrade({
            user_id: userId,
            accion: decision.accion,
            cantidad: 0,
            precio_entrada: currentPrice,
            stop_loss: decision.stop_loss,
            take_profit: decision.take_profit,
            modo_real: false,
            apalancamiento: apalancamiento // Added apalancamiento for simulated trades
        });
        return;
    }

    try {
        logger.info(`[${user?.nombre || 'Global'}] EJECUCION REAL: Preparando orden ${decision.accion}...`);

        const balance = await getBalance(user);
        if (!balance || balance <= 0) throw new Error('Balance invalido o cero.');

        const capitalEnRiesgo = balance * (riesgo_pct / 100);

        logger.info(`[${user?.nombre || 'Global'}] Balance: ${balance} USDT | Riesgo: ${riesgo_pct}% = ${capitalEnRiesgo.toFixed(2)} USDT`);

        if (capitalEnRiesgo <= 0) throw new Error('Capital en riesgo es 0.');
        if (!decision.stop_loss || decision.stop_loss === currentPrice) throw new Error('Stop loss invalido.');

        const distanciaSL = Math.abs(currentPrice - decision.stop_loss);
        const quantity = parseFloat((capitalEnRiesgo / distanciaSL).toFixed(4));

        if (quantity <= 0) throw new Error('Cantidad calculada invalida.');

        // Validacion: posicion no mayor al 90% del balance * apalancamiento
        const valorPosicion = quantity * currentPrice;
        const maxPosicion = balance * apalancamiento * 0.9;
        if (valorPosicion > maxPosicion) {
            throw new Error(`Posicion muy grande: ${valorPosicion.toFixed(2)} USDT > max ${maxPosicion.toFixed(2)} USDT`);
        }

        const symbol = process.env.PAR || 'BTC-USDT';
        const side = decision.accion === 'LONG' ? 'BUY' : 'SELL';

        await placeOrder({
            symbol,
            side,
            positionSide: decision.accion,
            type: 'MARKET',
            quantity,
            stopLoss: JSON.stringify({ type: 'STOP_MARKET', stopPrice: decision.stop_loss, workingType: 'MARK_PRICE' }),
            takeProfit: JSON.stringify({ type: 'TAKE_PROFIT_MARKET', stopPrice: decision.take_profit, workingType: 'MARK_PRICE' })
        }, user);

        logger.info(`[${user?.nombre || 'Global'}] Orden ${decision.accion} ejecutada | Qty: ${quantity} | SL: ${decision.stop_loss} | TP: ${decision.take_profit}`);

        await logger.logTrade({
            user_id: userId,
            accion: decision.accion,
            cantidad: capitalEnRiesgo,
            precio_entrada: currentPrice,
            stop_loss: decision.stop_loss,
            take_profit: decision.take_profit,
            modo_real: true,
            apalancamiento: apalancamiento // Added apalancamiento for real trades
        });

    } catch (error) {
        logger.error(`[${user?.nombre || 'Global'}] Fallo al ejecutar trade real`, error);
        throw error;
    }
}

async function getHistory(user = null, limit = 10) {
    try {
        const params = {
            symbol: process.env.PAR || 'BTC-USDT',
            limit: limit
        };
        const response = await request('GET', '/openApi/swap/v2/user/historyOrders', params, user);
        return response.data?.orders || [];
    } catch (e) {
        logger.error(`[${user?.nombre || 'Global'}] Error al obtener historial de BingX`, e.message);
        return [];
    }
}

async function getOpenTradeDuration(user = null) {
    try {
        const userId = user ? user.id : 1;
        const modo_str = user ? (user.modo_real ? 'REAL' : 'SIMULADO') : (process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO');
        const [rows] = await db.execute("SELECT direccion AS accion, timestamp_apertura FROM bot_trades WHERE timestamp_cierre IS NULL AND modo = ? AND user_id = ?", [modo_str, userId]);
        if (rows.length === 0) return null;
        
        let durations = {};
        for(let row of rows) {
            const diffMs = Math.max(0, Date.now() - new Date(row.timestamp_apertura).getTime());
            durations[row.accion] = (diffMs / 3600000).toFixed(1);
        }
        return durations;
    } catch(e) {
        logger.error(`[${user?.nombre || 'Global'}] Error al obtener duracion de trades abiertos`, e.message);
        return null;
    }
}

module.exports = { getPositions, getBalance, getTodayTrades, executeTrade, closeTrade, updateStopLoss, cancelOpenOrders, placeTrailingStop, checkAndCloseTrades, getOpenTradeDuration, getHistory };
