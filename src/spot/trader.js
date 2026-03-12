require('dotenv').config();
const logger = require('../logger');
const db = require('../db');
const crypto = require('crypto');
const axios = require('axios');

const BASE_URL = 'https://open-api.bingx.com';

function getSignature(params, secret) {
    const query = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function request(method, path, user, params = {}) {
    const apiKey = user ? user.bingx_key : process.env.BINGX_API_KEY;
    const secret = user ? user.bingx_secret : process.env.BINGX_SECRET;

    params.timestamp = Date.now();
    const signature = getSignature(params, secret);
    const queryString = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&') + `&signature=${signature}`;
    const url = `${BASE_URL}${path}?${queryString}`;
    
    try {
        const response = await axios({ 
            method, 
            url, 
            headers: { 'X-BX-APIKEY': apiKey } 
        });
        return response.data;
    } catch (error) {
        throw error;
    }
}

// Balance USDT y ETH en cuenta spot
async function getSpotBalance(user) {
    try {
        const res = await request('GET', '/openApi/spot/v1/account/balance', user);
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
        logger.error(`[SPOT] Error al obtener balance para usuario ${user?.nombre || 'default'}`, e.message);
        return { usdt: 0, eth: 0, usdtTotal: 0, ethTotal: 0 };
    }
}

// Historial de trades spot del dia (Filtrado por usuario)
async function getTodayTradesSpot(userId) {
    try {
        const query = `
            SELECT accion, precio_entrada, capital_usdt, cantidad_eth, timestamp_apertura
            FROM spot_trades
            WHERE user_id = ? AND DATE(timestamp_apertura) = CURDATE()
            ORDER BY timestamp_apertura DESC
            LIMIT 20
        `;
        const [rows] = await db.execute(query, [userId]);
        return rows;
    } catch (e) {
        logger.error(`[SPOT] Error obteniendo historial de hoy para user ${userId}`, e.message);
        return [];
    }
}

// Obtener ultimo precio de compra (Filtrado por usuario)
async function getUltimaCompra(userId) {
    try {
        const query = `
            SELECT precio_entrada
            FROM spot_trades
            WHERE user_id = ? AND accion = 'BUY'
            ORDER BY timestamp_apertura DESC LIMIT 1
        `;
        const [rows] = await db.execute(query, [userId]);
        return rows.length > 0 ? parseFloat(rows[0].precio_entrada) : null;
    } catch(e) {
        return null;
    }
}

async function placeSpotOrder(user, orderParams) {
    try {
        const res = await request('POST', '/openApi/spot/v1/trade/order', user, orderParams);
        if (res && res.code !== 0) {
            throw new Error(`BingX Spot Error: ${res.msg} (Code: ${res.code})`);
        }
        return res;
    } catch (e) {
        logger.error(`[SPOT] Error ejecutando orden para user ${user?.nombre}`, e.response?.data || e.message);
        throw e;
    }
}

// Comprar ETH con USDT
async function executeBuy(user, decision, precioActual) {
    const isReal = user.modo_real === 1; // Usamos el modo_real del usuario
    const symbol = process.env.PAR_SPOT || 'ETH-USDT';
    
    try {
        let usdtBalance = 0;
        if (isReal) {
            const bal = await getSpotBalance(user);
            usdtBalance = bal.usdt;
        } else {
            usdtBalance = 1000; // Simulado
        }

        const pct = (decision.capital_pct || 25) / 100;
        const montoCompra = usdtBalance * pct;

        logger.info(`[SPOT] Preparando orden de ${montoCompra.toFixed(2)} USDT para ${user.nombre} (${(pct*100).toFixed(0)}% del balance)`);

        if (isReal) {
            const orderRes = await placeSpotOrder(user, {
                symbol,
                side: 'BUY',
                type: 'MARKET',
                quoteOrderQty: montoCompra.toFixed(2)
            });
            
            if (!orderRes || orderRes.code !== 0) {
                logger.error(`[SPOT] No se pudo ejecutar orden en BingX para ${user.nombre}: ${orderRes?.msg || 'Error desconocido'}`);
                return;
            }
        }

        // Registrar en DB SOLO SI fUE EXITOSO o es simulado
        await db.execute(`
            INSERT INTO spot_trades (user_id, accion, precio_entrada, capital_usdt, cantidad_eth, cargo_ia, timestamp_apertura)
            VALUES (?, 'BUY', ?, ?, ?, ?, NOW())
        `, [user.id, precioActual, montoCompra, montoCompra / precioActual, decision.confianza]);

        logger.info(`[SPOT] Compra exitosa para ${user.nombre}: ${montoCompra.toFixed(2)} USDT`);

    } catch (e) {
        logger.error(`[SPOT] Error crítico en executeBuy para ${user.nombre}:`, e.message);
    }
}

// Vender ETH
async function executeSell(user, decision, precioActual) {
    const isReal = user.modo_real === 1;
    const symbol = process.env.PAR_SPOT || 'ETH-USDT';

    try {
        let ethBalance = 0;
        if (isReal) {
            const bal = await getSpotBalance(user);
            ethBalance = bal.eth;
        } else {
            // Buscar última compra simulada para saber cuánto vender
            const [lastTrade] = await db.execute('SELECT cantidad_eth FROM spot_trades WHERE user_id = ? AND accion = "BUY" ORDER BY id DESC LIMIT 1', [user.id]);
            ethBalance = lastTrade[0]?.cantidad_eth || 0;
        }

        if (ethBalance < 0.001) {
            logger.warn(`[SPOT] No hay ETH suficiente para vender en cuenta de ${user.nombre}`);
            return;
        }

        if (isReal) {
            await placeSpotOrder(user, {
                symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity: ethBalance.toFixed(5)
            });
        }

        await db.execute(`
            INSERT INTO spot_trades (user_id, accion, precio_entrada, capital_usdt, cantidad_eth, cargo_ia, timestamp_apertura)
            VALUES (?, 'SELL', ?, ?, ?, ?, NOW())
        `, [user.id, precioActual, ethBalance * precioActual, ethBalance, decision.confianza]);

        logger.info(`[SPOT] Venta ejecutada para ${user.nombre}: ${ethBalance} ETH en ${precioActual}`);

    } catch (e) {
        logger.error(`[SPOT] Error en executeSell para ${user.nombre}:`, e.message);
    }
}

// Obtener precio actual de ETH en tiempo real (BingX public ticker, sin auth)
async function getSpotPrice(symbol = 'ETH-USDT') {
    try {
        // Intentar con la versión con guión y sin guión
        const syms = [symbol, symbol.replace('-', '')];
        for (const s of syms) {
            const res = await axios.get(`${BASE_URL}/openApi/spot/v1/market/ticker`, { params: { symbol: s } }).catch(() => null);
            if (res?.data?.data) {
                const price = parseFloat(Array.isArray(res.data.data) ? res.data.data[0].lastPrice : res.data.data.lastPrice);
                if (price > 0) return price;
            }
        }
        return null;
    } catch (e) {
        logger.error('[SPOT] Error obteniendo precio de ETH:', e.message);
        return null;
    }
}

async function getHistory(user, symbol = 'ETH-USDT', limit = 20) {
    try {
        const res = await request('GET', '/openApi/spot/v1/trade/allOrders', user, { symbol, limit });
        if (res && res.code === 0) {
            return res.data || [];
        }
        return [];
    } catch (e) {
        logger.error(`[SPOT] Error obteniendo historial de BingX:`, e.message);
        return [];
    }
}

module.exports = {
    getSpotBalance,
    getSpotPrice,
    getTodayTradesSpot,
    getUltimaCompra,
    executeBuy,
    executeSell,
    getHistory
};
