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

async function tryEndpoint(path, params = {}) {
    params.timestamp = Date.now();
    const signature = getSignature(params);
    const queryString = Object.keys(params).sort().map(key => key + '=' + encodeURIComponent(params[key])).join('&') + '&signature=' + signature;
    const url = BASE_URL + path + '?' + queryString;
    
    try {
        console.log(`TRYING: ${path}`);
        let res = await axios({
            method: 'GET',
            url: url,
            headers: { 
                'X-BX-APIKEY': API_KEY,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
             }
        });
        console.log('Result:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log(`Error ${path}:`, e.response ? JSON.stringify(e.response.data) : e.message);
    }
}

async function discover() {
    const symbol = process.env.PAR || 'BTC-USDT';
    
    await tryEndpoint('/openApi/swap/v2/trade/openOrders', { symbol });
    // await tryEndpoint('/openApi/swap/v2/trade/pendingOrders', { symbol });
    // await tryEndpoint('/openApi/swap/v2/trade/triggerOrders', { symbol });
}

discover();
