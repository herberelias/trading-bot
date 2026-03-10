require('dotenv').config();
const axios = require('axios');
const logger = require('../logger');

const BASE_URL = 'https://open-api.bingx.com';

// Velas spot — BingX Spot usa endpoint diferente a futuros
async function getKlinesSpot(symbol, interval, limit = 100) {
    try {
        const path = '/openApi/spot/v1/market/kline';
        const response = await axios.get(`${BASE_URL}${path}`, {
            params: { symbol, interval, limit }
        });
        return response.data.data;
    } catch (error) {
        logger.error(`[SPOT] Error obteniendo Klines ${interval}`, error.message);
        throw error;
    }
}

async function getCandles15mSpot(symbol = null) {
    const par = symbol || process.env.PAR_SPOT || 'ETH-USDT';
    return await getKlinesSpot(par, '15m', 100);
}

async function getCandles1hSpot(symbol = null) {
    const par = symbol || process.env.PAR_SPOT || 'ETH-USDT';
    return await getKlinesSpot(par, '1h', 100);
}

async function getCandles4hSpot(symbol = null) {
    const par = symbol || process.env.PAR_SPOT || 'ETH-USDT';
    return await getKlinesSpot(par, '4h', 100);
}

module.exports = { getCandles15mSpot, getCandles1hSpot, getCandles4hSpot };
