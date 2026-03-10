require('dotenv').config();
const logger = require('./logger');
const db = require('./db');
const market = require('./market');
const crypto = require('crypto');
const axios = require('axios');

const API_KEY = process.env.BINGX_API_KEY;
const SECRET = process.env.BINGX_SECRET;
const BASE_URL = 'https://open-api.bingx.com';

function getSignature(params) {
    const query = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHmac('sha256', SECRET).update(query).digest('hex');
}

async function request(method, path, params = {}) {
    params.timestamp = Date.now();
    const signature = getSignature(params);
    const queryString = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&') + `&signature=${signature}`;
    const url = `${BASE_URL}${path}?${queryString}`;

    try {
        const response = await axios({ method, url, headers: { 'X-BX-APIKEY': API_KEY } });
        return response.data;
    } catch (error) {
        throw error;
    }
}

async function getBalance() {
    try {
        const res = await request('GET', '/openApi/swap/v2/user/balance');
        // BingX Swap V2 devuelve la estructura: res.data.balance.balance
        if (res && res.data && res.data.balance) {
            // A veces el balance viene directo en el objeto o en un array dependiendo del asset
            const balanceObj = Array.isArray(res.data.balance) ? res.data.balance[0] : res.data.balance;
            const saldo = balanceObj.balance || balanceObj.equity || balanceObj.availableMargin;

            if (saldo !== undefined) {
                return parseFloat(saldo);
            }
        }
        logger.error('Estructura de balance inesperada en BingX:', JSON.stringify(res));
        return 0;
    } catch (e) {
        logger.error('Error al obtener balance', e.message);
        return 0;
    }
}

async function getPositions(symbol) {
    try {
        const res = await request('GET', '/openApi/swap/v2/user/positions', { symbol });
        // Buscar posiciones abiertas
        return res.data;
    } catch (e) {
        logger.error('Error al obtener posiciones', e.message);
        return [];
    }
}

async function placeOrder(orderParams) {
    try {
        const res = await request('POST', '/openApi/swap/v2/trade/order', orderParams);

        // BingX siempre devuelve HTTP 200, incluso cuando hay errores (ej. saldo insuficiente).
        // El verdadero estado de éxito está en "res.code === 0"
        if (res && res.code !== 0) {
            // Error interno de la API que no lanza excepción HTTP
            throw new Error(`BingX API Error: ${res.msg || JSON.stringify(res)} (Code: ${res.code})`);
        }

        return res;
    } catch (e) {
        logger.error('Error al ejecutar orden', e.response?.data || e.message);
        throw e;
    }
}

async function executeTrade(decision, currentPrice) {
    const isReal = process.env.MODO_REAL === 'true';

    if (!isReal) {
        logger.info(`🔵 Simulación registrada (MODO_REAL=false). Accion: ${decision.accion}`);
        // Guardar log simulado
        logger.logTrade({
            accion: decision.accion,
            cantidad: 0,
            precio_entrada: currentPrice,
            stop_loss: decision.stop_loss,
            take_profit: decision.take_profit,
            modo_real: false
        });
        return;
    }

    try {
        // Lógica de ejecución en cuenta real
        logger.info(`🔴 EJECUCIÓN REAL: Preparando orden a BingX...`);

        const balance = await getBalance();
        if (!balance || balance <= 0) {
            logger.error('No se pudo obtener balance de BingX');
            throw new Error('No se pudo obtener balance de BingX o es cero.');
        }

        const riskPct = parseFloat(process.env.RIESGO_POR_TRADE);
        const lossAmount = balance * (riskPct / 100);

        if (lossAmount <= 0) {
            throw new Error('El capital a arriesgar (lossAmount) resulta en 0.');
        }

        // Validar SL para que no divida por cero
        if (!decision.stop_loss || decision.stop_loss === currentPrice) {
            throw new Error('Stop loss inválido o igual al precio actual.');
        }

        // Tamaño posicion = Riesgo / distancia_al_SL
        const distanciaSL = Math.abs(currentPrice - decision.stop_loss);
        const rawQuantity = lossAmount / distanciaSL;

        // BingX suele requerir precisión, lo dejamos a 4 decimales por defecto para BTC
        const quantity = parseFloat(rawQuantity.toFixed(4));

        if (quantity <= 0) {
            throw new Error('La cantidad calculada de la posición es muy pequeña o inválida.');
        }

        const symbol = process.env.PAR;
        const side = decision.accion === 'LONG' ? 'BUY' : 'SELL';

        const orderParams = {
            symbol: symbol,
            side: side,
            positionSide: decision.accion,
            type: 'MARKET',
            quantity: quantity,
            // Dependiendo de bingX, SL y TP pueden enviarse aquí o requerir llamadas extra.
            // Lo enviaremos si la API V2 los acepta en params adicionales, si no, se omiten.
            // Para asegurar la completitud, pasaremos sl y tp aunque Bingx requiera formato específico
            stopLoss: JSON.stringify({
                type: 'STOP_MARKET',
                stopPrice: decision.stop_loss
            }),
            takeProfit: JSON.stringify({
                type: 'TAKE_PROFIT_MARKET',
                stopPrice: decision.take_profit
            })
        };

        // Ejecutar orden real
        await placeOrder(orderParams);
        logger.info(`✅ Orden ${decision.accion} ejecutada en BingX. Cantidad: ${quantity}`);

        logger.logTrade({
            accion: decision.accion,
            cantidad: lossAmount, // Guardamos el capital arriesgado (capital_usado en BD)
            precio_entrada: currentPrice,
            stop_loss: decision.stop_loss,
            take_profit: decision.take_profit,
            modo_real: true
        });
    } catch (error) {
        logger.error('Fallo al ejecutar trade real', error);
        throw error;
    }
}

async function closeTrade(currentPrice) {
    const isReal = process.env.MODO_REAL === 'true';
    const symbol = process.env.PAR;

    if (!isReal) {
        logger.info('🔵 Simulación: Cerrando posición (MODO_REAL=false)');
        await logger.logTrade({
            accion: 'CLOSE', cantidad: 0,
            precio_entrada: currentPrice,
            stop_loss: null, take_profit: null, modo_real: false
        });
        return;
    }

    try {
        const positions = await getPositions(symbol);
        if (!positions || positions.length === 0) {
            logger.info('No hay posición abierta para cerrar.');
            return;
        }
        const pos = positions[0];
        const closeSide = pos.positionSide === 'LONG' ? 'SELL' : 'BUY';
        const qty = Math.abs(parseFloat(pos.positionAmt));

        await placeOrder({
            symbol, side: closeSide,
            positionSide: pos.positionSide,
            type: 'MARKET', quantity: qty
        });

        logger.info(`✅ Posición ${pos.positionSide} cerrada. Qty: ${qty}`);
        await logger.logTrade({
            accion: 'CLOSE', cantidad: qty,
            precio_entrada: currentPrice,
            stop_loss: null, take_profit: null, modo_real: true
        });
    } catch (error) {
        logger.error('Error al cerrar posición', error);
        throw error;
    }
}

module.exports = { getPositions, getBalance, executeTrade, closeTrade };
