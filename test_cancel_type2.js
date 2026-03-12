process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const API_KEY = process.env.BINGX_API_KEY;
const SECRET = process.env.BINGX_SECRET || 'no-secret';
const BASE_URL = 'https://open-api.bingx.com';

function getSignature(params) {
    const query = Object.keys(params).sort().map(key => key + '=' + params[key]).join('&');
    return crypto.createHmac('sha256', SECRET).update(query).digest('hex');
}

async function cancelTriggers() {
    const symbol = process.env.PAR || 'BTC-USDT';
    const params = { symbol, type: 2, timestamp: Date.now() };
    const signature = getSignature(params);
    const queryString = Object.keys(params).sort().map(key => key + '=' + encodeURIComponent(params[key])).join('&') + '&signature=' + signature;
    const url = BASE_URL + '/openApi/swap/v2/trade/allOpenOrders?' + queryString;

    try {
        console.log('--- INTENTANDO CANCELAR TRIGGER ORDERS (type=2) ---');
        let res = await axios({
            method: 'DELETE',
            url: url,
            headers: { 'X-BX-APIKEY': API_KEY }
        });
        console.log('Result:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Error:', e.response ? JSON.stringify(e.response.data) : e.message);
    }
}

cancelTriggers();
