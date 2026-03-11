require('dotenv').config();
const logger = require('../logger');
const db = require('../db');
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

// Balance USDT y ETH en cuenta spot
async function getSpotBalance() {
    try {
        const res = await request('GET', '/openApi/spot/v1/account/balance');
        const balances = res.data.balances || [];
        const usdt = balances.find(b => b.asset === 'USDT');
        const eth = balances.find(b => b.asset === 'ETH');
        return {
            usdt: parseFloat(usdt ? usdt.free : 0),
            eth: parseFloat(eth ? eth.free : 0),
            usdtTotal: parseFloat(usdt ? usdt.total : 0),
            ethTotal: parseFloat(eth ? eth.total : 0)
        };
    } catch (e) {
        logger.error('[SPOT] Error al obtener balance', e.message);
        return { usdt: 0, eth: 0, usdtTotal: 0, ethTotal: 0 };
    }
}

// Historial de trades spot del dia
async function getTodayTradesSpot() {
    try {
        const query = `
            SELECT accion, precio_entrada, capital_usdt, cantidad_eth, timestamp_apertura
            FROM spot_trades
            WHERE DATE(timestamp_apertura) = CURDATE()
            ORDER BY timestamp_apertura DESC
            LIMIT 20
        `;
        const [rows] = await db.execute(query);
        return rows;
    } catch (e) {
        logger.error('[SPOT] Error obteniendo historial de hoy', e.message);
        return [];
    }
}

async function placeSpotOrder(orderParams) {
    try {
        const res = await request('POST', '/openApi/spot/v1/trade/order', orderParams);
        if (res && res.code !== 0) {
            throw new Error(`BingX Spot Error: ${res.msg} (Code: ${res.code})`);
        }
        return res;
    } catch (e) {
        logger.error('[SPOT] Error ejecutando orden', e.response?.data || e.message);
        throw e;
    }
}

// Comprar ETH con USDT
async function executeBuy(decision, precioActual) {
    const isReal = process.env.MODO_REAL_SPOT === 'true';
    const symbol = process.env.PAR_SPOT;
    const capitalMaxPct = parseFloat(process.env.CAPITAL_MAXIMO_PCT) || 80;

    if (!isReal) {
        logger.info(`[SPOT SIMULADO] BUY ETH | Capital: ${decision.capital_pct}% | Precio: ${precioActual} | TP: ${decision.precio_objetivo} | SL ref: ${decision.stop_loss_ref}`);
        await logger.logTradeSpot({
            accion: 'BUY',
            precio_entrada: precioActual,
            precio_objetivo: decision.precio_objetivo,
            stop_loss_ref: decision.stop_loss_ref,
            capital_usdt: 0,
            cantidad_eth: 0
        });
        return;
    }

    try {
        const balance = await getSpotBalance();
        if (balance.usdt < 5) throw new Error(`USDT insuficiente: ${balance.usdt}`);

        const capitalPct = Math.min(parseFloat(decision.capital_pct) || 50, capitalMaxPct);
        const capitalUsdt = parseFloat((balance.usdt * (capitalPct / 100)).toFixed(2));
        if (capitalUsdt < 5) throw new Error(`Capital calculado muy pequeno: ${capitalUsdt} USDT`);

        const cantidadEth = parseFloat((capitalUsdt / precioActual).toFixed(6));

        logger.info(`[SPOT] BUY: ${cantidadEth} ETH por ${capitalUsdt} USDT (${capitalPct}% del balance)`);

        await placeSpotOrder({
            symbol,
            side: 'BUY',
            type: 'MARKET',
            quoteOrderQty: capitalUsdt
        });

        logger.info(`[SPOT] Orden BUY ejecutada exitosamente.`);

        // --- GATILLOS AUTOMÁTICOS (Take Profit en Spot) ---
        if (decision.precio_objetivo) {
            try {
                // Esperamos 2 segundos para asegurar acreditación y cómputo de comisiones
                await new Promise(r => setTimeout(r, 2000));
                
                const currentBal = await getSpotBalance();
                // Dejamos un margen del 0.2% fuera (por si BingX cobra fees en la misma moneda)
                // y redondeamos a 4 decimales para evitar el error de "PRECISION_INVALID"
                const ethDisponible = Math.floor((currentBal.eth * 0.998) * 10000) / 10000;

                if (ethDisponible > 0.001) {
                    logger.info(`[SPOT] Colocando gatillo LIMIT (Take Profit) a ${decision.precio_objetivo} USDT para vender ${ethDisponible} ETH.`);
                    await placeSpotOrder({
                        symbol,
                        side: 'SELL',
                        type: 'LIMIT',
                        price: decision.precio_objetivo,
                        quantity: ethDisponible
                    });
                    logger.info(`[SPOT] Gatillo TP colocado con luz verde.`);
                }
            } catch(e) {
                logger.error('[SPOT] Falló al automatizar el gatillo TP:', e.message);
            }
        }
        // --------------------------------------------------

        await logger.logTradeSpot({
            accion: 'BUY',
            precio_entrada: precioActual,
            precio_objetivo: decision.precio_objetivo,
            stop_loss_ref: decision.stop_loss_ref,
            capital_usdt: capitalUsdt,
            cantidad_eth: cantidadEth
        });

    } catch (error) {
        logger.error('[SPOT] Error en BUY', error);
        throw error;
    }
}

// Vender ETH por USDT
async function executeSell(decision, precioActual) {
    const isReal = process.env.MODO_REAL_SPOT === 'true';
    const symbol = process.env.PAR_SPOT;

    if (!isReal) {
        logger.info(`[SPOT SIMULADO] SELL ETH | ${decision.sell_pct}% | Precio: ${precioActual}`);
        await logger.logTradeSpot({
            accion: 'SELL',
            precio_entrada: precioActual,
            precio_objetivo: null,
            stop_loss_ref: null,
            capital_usdt: 0,
            cantidad_eth: 0
        });
        return;
    }

    try {
        const balance = await getSpotBalance();
        if (balance.eth <= 0.0001) {
            logger.info('[SPOT] Sin ETH disponible para vender.');
            return;
        }

        const sellPct = parseFloat(decision.sell_pct) || 100;
        const cantidadVender = parseFloat((balance.eth * (sellPct / 100)).toFixed(6));
        if (cantidadVender <= 0) throw new Error('Cantidad a vender invalida.');

        const ingresoEstimado = parseFloat((cantidadVender * precioActual).toFixed(2));

        logger.info(`[SPOT] SELL: ${cantidadVender} ETH (${sellPct}%) por ~${ingresoEstimado} USDT`);

        await placeSpotOrder({
            symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity: cantidadVender
        });

        logger.info(`[SPOT] Orden SELL ejecutada exitosamente.`);

        await logger.logTradeSpot({
            accion: 'SELL',
            precio_entrada: precioActual,
            precio_objetivo: null,
            stop_loss_ref: null,
            capital_usdt: ingresoEstimado,
            cantidad_eth: cantidadVender
        });

    } catch (error) {
        logger.error('[SPOT] Error en SELL', error);
        throw error;
    }
}

module.exports = { getSpotBalance, getTodayTradesSpot, executeBuy, executeSell };
