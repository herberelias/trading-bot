process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const axios = require('axios');
const BASE_URL = 'https://open-api.bingx.com';

async function testTicker() {
    try {
        const path = '/openApi/spot/v1/market/ticker';
        const response = await axios.get(`${BASE_URL}${path}`);
        const data = response.data.data || [];
        console.log('Total tickers:', data.length);
        if (data.length > 0) {
            console.log('First ticker keys:', Object.keys(data[0]));
            console.log('First ticker sample:', data[0]);
        }
        
        const filtered = data
            .filter(t => t.symbol.endsWith('-USDT'))
            .sort((a, b) => {
                const volA = parseFloat(a.quoteVolume || a.volume || 0);
                const volB = parseFloat(b.quoteVolume || b.volume || 0);
                return volB - volA;
            });
            
        console.log('Top 10 by volume/quoteVolume:');
        filtered.slice(0, 10).forEach(t => {
            console.log(`${t.symbol}: Vol=${t.volume}, QuoteVol=${t.quoteVolume}`);
        });

    } catch (e) {
        console.error('Error:', e.message);
    }
}

testTicker();
