require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function getTradeDecision(indicators, isPositionOpen) {
    const prompt = `Eres un trader experto en futuros perpetuos de criptomonedas.
    Analiza estos indicadores técnicos de BTC/USDT en timeframe 15m:
    - RSI(14): ${indicators.rsi}
    - EMA20: ${indicators.ema20}
    - EMA50: ${indicators.ema50}
    - MACD: ${indicators.macd} Signal: ${indicators.signal} Histogram: ${indicators.histogram}
    - Precio actual: ${indicators.currentPrice}
    - Volumen actual vs promedio: ${indicators.volumeVsAvg}%
    - Posición abierta actualmente: ${isPositionOpen ? 'SI' : 'NO'}
    
    Responde ÚNICAMENTE con este JSON sin texto adicional ni backticks:
    {
      "accion": "LONG" | "SHORT" | "HOLD" | "CLOSE",
      "confianza": 0.00 a 1.00,
      "razon": "explicación breve",
      "stop_loss": precio numérico,
      "take_profit": precio numérico
    }`;

    try {
        const response = await axios.post(URL, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        let text = response.data.candidates[0].content.parts[0].text.trim();
        // Limpiamos los backticks de generacion de codigo markdown por si la AI los agrega a pesar de la instruccion
        if (text.startsWith('\`\`\`json')) {
            text = text.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
        } else if (text.startsWith('\`\`\`')) {
            text = text.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
        }

        const decision = JSON.parse(text);
        return decision;
    } catch (error) {
        logger.error('Error al contactar a Gemini API o al parsear la respuesta JSON', error.message);
        return null;
    }
}

module.exports = { getTradeDecision };
