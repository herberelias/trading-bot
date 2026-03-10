require('dotenv').config();
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

async function test() {
    try {
        const path = '/openApi/spot/v1/market/kline';
        const response = await axios.get(`https://open-api.bingx.com${path}?symbol=ETH-USDT&interval=15m&limit=2`, {
            headers: { 'X-BX-APIKEY': process.env.BINGX_API_KEY },
            httpsAgent: agent
        });
        console.log(JSON.stringify(response.data.data[0], null, 2));
    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
test();
