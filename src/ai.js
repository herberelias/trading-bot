require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function consultarGemini(indicators15m, indicators1h, precioActual, isPositionOpen) {
    const tendencia1h = parseFloat(indicators1h.ema20) > parseFloat(indicators1h.ema50) ? 'por encima' : 'por debajo';

    const prompt = `Eres un trader experto en futuros perpetuos.
Analiza BTC/USDT con contexto multi-timeframe:

TIMEFRAME 1H (tendencia principal):
- RSI(14): ${indicators1h.rsi}
- EMA20: ${indicators1h.ema20}
- EMA50: ${indicators1h.ema50}
- MACD: ${indicators1h.macd} | Signal: ${indicators1h.signal} | Histogram: ${indicators1h.histogram}
- Tendencia: EMA20 ${tendencia1h} de EMA50

TIMEFRAME 15M (señal de entrada):
- RSI(14): ${indicators15m.rsi}
- EMA20: ${indicators15m.ema20}
- EMA50: ${indicators15m.ema50}
- MACD: ${indicators15m.macd} | Signal: ${indicators15m.signal} | Histogram: ${indicators15m.histogram}

CONTEXTO:
- Precio actual: ${precioActual}
- Volumen actual vs promedio: ${indicators15m.volumeVsAvg}%
- Posición abierta: ${isPositionOpen ? 'SI' : 'NO'}

REGLAS DE DECISIÓN:
- Solo abrir LONG si tendencia 1h es alcista Y señal 15m confirma
- Solo abrir SHORT si tendencia 1h es bajista Y señal 15m confirma
- Si timeframes contradicen → HOLD obligatorio

Responde ÚNICAMENTE con JSON sin texto ni backticks:
{
  "accion": "LONG" | "SHORT" | "HOLD" | "CLOSE",
  "confianza": 0.00 a 1.00,
  "razon": "explicación mencionando ambos timeframes",
  "stop_loss": precio numérico,
  "take_profit": precio numérico
}`;

    let retries = 3;
    let attempt = 0;

    while (attempt < retries) {
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
            const status = error.response ? error.response.status : null;
            attempt++;

            if (status === 429 || status === 503 || status === 500) {
                logger.error(`Error ${status} en Gemini API. Intento ${attempt} de ${retries}. Reintentando en 10s...`, error.message);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Esperar 10 segundos antes de reintentar
                } else {
                    logger.error('Se agotaron los reintentos para Gemini API.', error.message);
                    return null;
                }
            } else {
                logger.error('Error al contactar a Gemini API o al parsear JSON', error.message);
                return null;
            }
        }
    }
    return null;
}

module.exports = { consultarGemini, getTradeDecision: consultarGemini };
