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
    // Lista de respaldo (Failsafe) con monedas sólidas por si falla la API
    const backupList = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT', 'ADA-USDT', 'AVAX-USDT', 'DOT-USDT', 'LINK-USDT', 'MATIC-USDT', 'NEAR-USDT', 'LTC-USDT', 'FET-USDT', 'RENDER-USDT', 'ARB-USDT'];

    try {
        const path = '/openApi/spot/v1/market/ticker';
        const response = await axios.get(`${BASE_URL}${path}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 10000
        });
        
        const allTickers = response.data.data || [];
        
        if (allTickers.length === 0) {
            logger.warn(`[SPOT] Ticker de BingX vacío. Usando lista de respaldo.`);
            return backupList.slice(0, limit);
        }

        const filtered = allTickers
            .filter(t => t.symbol.endsWith('-USDT'))
            .filter(t => parseFloat(t.quoteVolume || 0) > 0)
            .sort((a, b) => parseFloat(b.quoteVolume || 0) - parseFloat(a.quoteVolume || 0));

        const results = filtered.slice(0, limit).map(t => t.symbol);
        return results.length > 0 ? results : backupList.slice(0, limit);

    } catch (error) {
        const msg = error.response ? `Status ${error.response.status}` : error.message;
        logger.warn(`[SPOT] Error obteniendo top symbols (${msg}). Usando lista de respaldo.`);
        return backupList.slice(0, limit);
    }
}

module.exports = { getCandles15mSpot, getCandles1hSpot, getCandles4hSpot, getCandles1dSpot, getTopSymbolsSpot };
