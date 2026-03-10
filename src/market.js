require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');

const API_KEY = process.env.BINGX_API_KEY;
const SECRET = process.env.BINGX_SECRET;
const BASE_URL = 'https://open-api.bingx.com';

function getSignature(params, secretFunc = SECRET) {
    if (!secretFunc) return '';
    const query = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
    return crypto.createHmac('sha256', secretFunc).update(query).digest('hex');
}

async function request(method, path, params = {}) {
    params.timestamp = Date.now();
    const signature = getSignature(params);
    const queryString = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&') + `&signature=${signature}`;
    const url = `${BASE_URL}${path}?${queryString}`;

    try {
        const response = await axios({
            method,
            url,
            headers: {
                'X-BX-APIKEY': API_KEY,
            }
        });
        return response.data;
    } catch (error) {
        logger.error(`Error en BingX API: ${path}`, error.response ? error.response.data : error.message);
        throw error;
    }
}

async function getKlines(symbol, interval, limit = 100) {
    try {
        const path = '/openApi/swap/v2/quote/klines';
        const response = await axios.get(`${BASE_URL}${path}?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        return response.data.data;
    } catch (error) {
        logger.error(`Error obteniendo Klines de BingX para ${interval}`, error.message);
        throw error;
    }
}

async function getCandles15m(symbol = null) {
    const par = symbol || process.env.PAR || 'BTC-USDT';
    return await getKlines(par, '15m', 100);
}

async function getCandles1h(symbol = null) {
    const par = symbol || process.env.PAR || 'BTC-USDT';
    return await getKlines(par, '1h', 50);
}

// AGREGAR esta funcion nueva:
async function getCandles4h(symbol = null) {
    const par = symbol || process.env.PAR || 'BTC-USDT';
    return await getKlines(par, '4h', 100);
}

// AGREGAR esta funcion nueva:
async function getFundingRate(symbol = null) {
    try {
        const par = symbol || process.env.PAR || 'BTC-USDT';
        const path = '/openApi/swap/v2/quote/premiumIndex';
        const response = await axios.get(`${BASE_URL}${path}?symbol=${par}`);
        const data = response.data.data;
        if (data) {
            return {
                fundingRate: (parseFloat(data.lastFundingRate) * 100).toFixed(4),
                nextFundingTime: data.nextFundingTime,
                markPrice: parseFloat(data.markPrice)
            };
        }
        return null;
    } catch (error) {
        logger.error('Error obteniendo Funding Rate', error.message);
        return null;
    }
}

module.exports = { request, getKlines, getCandles15m, getCandles1h, getCandles4h, getFundingRate };
