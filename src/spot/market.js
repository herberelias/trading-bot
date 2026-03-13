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
        const data = response.data.data;
        // Si la data es un arreglo de arreglos (Spot V1), la transformamos a objetos
        if (data && data.length > 0 && Array.isArray(data[0])) {
            return data.map(item => ({
                time: item[0],
                open: parseFloat(item[1]),
                high: parseFloat(item[2]),
                low: parseFloat(item[3]),
                close: parseFloat(item[4]),
                volume: parseFloat(item[5])
            }));
        }
        return data;
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

async function getCandles1dSpot(symbol = null) {
    const par = symbol || process.env.PAR_SPOT || 'ETH-USDT';
    return await getKlinesSpot(par, '1d', 100);
}

async function getTopSymbolsSpot(limit = 30) {
    try {
        const path = '/openApi/spot/v1/market/ticker';
        const response = await axios.get(`${BASE_URL}${path}`);
        const allTickers = response.data.data || [];
        
        // Filtrar solo pares -USDT y que tengan volumen significativo (evitar basura)
        const filtered = allTickers
            .filter(t => t.symbol.endsWith('-USDT'))
            .filter(t => parseFloat(t.volume) > 0) // Que tengan volumen
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)); // Ordenar por volumen en USDT

        return filtered.slice(0, limit).map(t => t.symbol);
    } catch (error) {
        logger.error(`[SPOT] Error obteniendo top symbols`, error.message);
        return [];
    }
}

module.exports = { getCandles15mSpot, getCandles1hSpot, getCandles4hSpot, getCandles1dSpot, getTopSymbolsSpot };
