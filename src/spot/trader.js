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

// Balance completo en cuenta spot
async function getFullSpotBalance(user) {
    try {
        const res = await request('GET', '/openApi/spot/v1/account/balance', user);
        return res.data.balances || [];
    } catch (e) {
        logger.error(`[SPOT] Error al obtener balance completo para ${user?.nombre}`, e.message);
        return [];
    }
}

async function getSpotBalance(user, asset = 'ETH') {
    const balances = await getFullSpotBalance(user);
    const usdt = balances.find(b => b.asset === 'USDT');
    const target = balances.find(b => b.asset === asset.toUpperCase());
    return {
        usdt: parseFloat(usdt ? usdt.free : 0),
        asset: parseFloat(target ? target.free : 0),
        usdtTotal: parseFloat(usdt ? usdt.total : 0),
        assetTotal: parseFloat(target ? target.total : 0)
    };
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

// Obtener ultimo precio de compra de un simbolo (Filtrado por usuario)
async function getUltimaCompra(userId, symbol) {
    try {
        const query = `
            SELECT precio_entrada, timestamp_apertura
            FROM spot_trades
            WHERE user_id = ? AND symbol = ? AND accion = 'BUY'
            ORDER BY timestamp_apertura DESC LIMIT 1
        `;
        const [rows] = await db.execute(query, [userId, symbol]);
        if (rows.length === 0) return null;
        return {
            precio: parseFloat(rows[0].precio_entrada),
            fecha: new Date(rows[0].timestamp_apertura)
        };
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

// Comprar Cripto con USDT
async function executeBuy(user, decision, precioActual) {
    const isReal = user.modo_real === 1;
    const symbol = decision.symbol || process.env.PAR_SPOT || 'ETH-USDT';
    
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

        logger.info(`[SPOT] Preparando orden de ${montoCompra.toFixed(2)} USDT para ${user.nombre} (${(pct*100).toFixed(0)}% del balance) en ${symbol}`);

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

        // Registrar en DB
        await db.execute(`
            INSERT INTO spot_trades (user_id, symbol, accion, precio_entrada, capital_usdt, cantidad, cargo_ia, timestamp_apertura)
            VALUES (?, ?, 'BUY', ?, ?, ?, ?, NOW())
        `, [user.id, symbol, precioActual, montoCompra, montoCompra / precioActual, decision.confianza]);

        logger.info(`[SPOT] Compra exitosa para ${user.nombre}: ${montoCompra.toFixed(2)} USDT en ${symbol}`);

    } catch (e) {
        logger.error(`[SPOT] Error crítico en executeBuy para ${user.nombre}:`, e.message);
    }
}

// Vender Cripto
async function executeSell(user, decision, precioActual) {
    const isReal = user.modo_real === 1;
    const symbol = decision.symbol || process.env.PAR_SPOT || 'ETH-USDT';
    const asset = symbol.split('-')[0];

    try {
        let assetBalance = 0;
        if (isReal) {
            const bal = await getSpotBalance(user, asset);
            assetBalance = bal.asset;
        } else {
            // Buscar última compra simulada de este simbolo
            const [lastTrade] = await db.execute('SELECT cantidad FROM spot_trades WHERE user_id = ? AND symbol = ? AND accion = "BUY" ORDER BY id DESC LIMIT 1', [user.id, symbol]);
            assetBalance = lastTrade[0]?.cantidad || 0;
        }

        const sellPct = (decision.sell_pct || 100) / 100;
        const qtyToSell = assetBalance * sellPct;

        if (qtyToSell <= 0) {
            logger.warn(`[SPOT] No hay ${asset} para vender para ${user.nombre}`);
            return;
        }

        if (isReal) {
            await placeSpotOrder(user, {
                symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity: qtyToSell.toFixed(5)
            });
        }

        await db.execute(`
            INSERT INTO spot_trades (user_id, symbol, accion, precio_entrada, capital_usdt, cantidad, cargo_ia, timestamp_apertura)
            VALUES (?, ?, 'SELL', ?, ?, ?, ?, NOW())
        `, [user.id, symbol, precioActual, qtyToSell * precioActual, qtyToSell, decision.confianza]);

        logger.info(`[SPOT] Venta ejecutada para ${user.nombre}: ${qtyToSell.toFixed(6)} ${asset} en ${precioActual}`);

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
    getFullSpotBalance,
    getSpotBalance,
    getSpotPrice,
    getTodayTradesSpot,
    getUltimaCompra,
    executeBuy,
    executeSell,
    getHistory
};
