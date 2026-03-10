require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function consultarGemini(indicators15m, indicators1h, precioActual, posicionesAbiertas, balance, historialHoy) {
    const tendencia1h = parseFloat(indicators1h.ema20) > parseFloat(indicators1h.ema50)
        ? 'ALCISTA (EMA20 > EMA50)'
        : 'BAJISTA (EMA20 < EMA50)';

    const rsi1h = parseFloat(indicators1h.rsi);
    const rsi15m = parseFloat(indicators15m.rsi);
    const histogram1h = parseFloat(indicators1h.histogram);
    const histogram15m = parseFloat(indicators15m.histogram);

    // Construir contexto de posiciones abiertas
    let posicionesStr = 'Ninguna';
    if (posicionesAbiertas && posicionesAbiertas.length > 0) {
        posicionesStr = posicionesAbiertas.map(p => {
            const pnlPct = p.unrealizedProfit && p.initialMargin
                ? ((parseFloat(p.unrealizedProfit) / parseFloat(p.initialMargin)) * 100).toFixed(2)
                : 'N/A';
            return `  - Direccion: ${p.positionSide} | Entrada: ${p.avgPrice} | Cantidad: ${p.positionAmt} | SL actual: ${p.stopLoss || 'no definido'} | PnL: ${p.unrealizedProfit} USDT (${pnlPct}%) | Margen usado: ${p.initialMargin} USDT`;
        }).join('\n');
    }

    // Historial del dia
    let historialStr = 'Sin trades hoy';
    if (historialHoy && historialHoy.length > 0) {
        const totalTrades = historialHoy.length;
        const pnlTotal = historialHoy.reduce((acc, t) => acc + parseFloat(t.capital_usado || 0), 0).toFixed(2);
        historialStr = `${totalTrades} trades hoy | Capital total usado: ${pnlTotal} USDT`;
    }

    const prompt = `Eres un trader profesional experto en futuros perpetuos de criptomonedas.
Tu objetivo es maximizar ganancias gestionando el riesgo de forma inteligente en BTC-USDT en BingX.
Tienes LIBERTAD TOTAL para decidir: que hacer, cuanto arriesgar, cuando entrar, cuando salir y cuando mover el stop loss.

═══════════════════════════════════════
CONTEXTO DE MERCADO ACTUAL
═══════════════════════════════════════

TIMEFRAME 1H (tendencia principal):
- Tendencia: ${tendencia1h}
- RSI(14): ${indicators1h.rsi} ${rsi1h > 70 ? '[SOBRECOMPRADO]' : rsi1h < 30 ? '[SOBREVENDIDO]' : ''}
- EMA20: ${indicators1h.ema20} | EMA50: ${indicators1h.ema50}
- MACD: ${indicators1h.macd} | Signal: ${indicators1h.signal} | Histogram: ${indicators1h.histogram} ${histogram1h > 0 ? '(momentum alcista)' : '(momentum bajista)'}

TIMEFRAME 15M (senal de entrada):
- RSI(14): ${indicators15m.rsi} ${rsi15m > 70 ? '[SOBRECOMPRADO]' : rsi15m < 30 ? '[SOBREVENDIDO]' : ''}
- EMA20: ${indicators15m.ema20} | EMA50: ${indicators15m.ema50}
- MACD: ${indicators15m.macd} | Signal: ${indicators15m.signal} | Histogram: ${indicators15m.histogram} ${histogram15m > 0 ? '(momentum alcista)' : '(momentum bajista)'}
- Volumen actual vs promedio: ${indicators15m.volumeVsAvg}%

PRECIO ACTUAL BTC: ${precioActual} USDT

═══════════════════════════════════════
ESTADO DE LA CUENTA
═══════════════════════════════════════

Balance disponible: ${balance} USDT
Apalancamiento configurado: ${process.env.APALANCAMIENTO}x
Modo: ${process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO'}

Posiciones abiertas actualmente:
${posicionesStr}

Performance hoy:
${historialStr}

═══════════════════════════════════════
ACCIONES DISPONIBLES
═══════════════════════════════════════

Puedes elegir UNA de estas acciones:

1. LONG    — Abrir posicion larga (apostar al alza)
2. SHORT   — Abrir posicion corta (apostar a la baja)
3. HOLD    — No hacer nada, esperar mejor momento
4. CLOSE   — Cerrar todas las posiciones abiertas
5. MOVE_SL — Mover el stop loss de una posicion abierta (para asegurar ganancias o reducir riesgo)

═══════════════════════════════════════
CRITERIOS PROFESIONALES DE DECISION
═══════════════════════════════════════

CUANDO ENTRAR (LONG/SHORT):
- Tendencia 1h y 15m alineadas en la misma direccion
- Volumen por encima del promedio (volumeVsAvg > 110%)
- RSI no en zona extrema contraria a la entrada
- MACD histogram confirmando la direccion

CUANDO CERRAR (CLOSE):
- Precio alcanzo zona de resistencia/soporte clave
- Senal de reversión clara en ambos timeframes
- La posicion lleva mucho tiempo sin moverse (estancada)
- El mercado cambio de tendencia en 1h

CUANDO MOVER EL STOP LOSS (MOVE_SL):
- La posicion tiene ganancia mayor a 0.8% — considera mover SL a breakeven (precio de entrada)
- La posicion tiene ganancia mayor a 1.5% — considera mover SL a +0.3% sobre entrada (ganancia asegurada)
- La posicion tiene ganancia mayor a 3% — trailing agresivo, SL debe seguir al precio
- El precio se alejo fuerte del SL original — puedes ajustarlo mas cerca para proteger
- NUNCA muevas el SL en contra de la posicion (no amplies la perdida)

GESTION DE RIESGO (TU decides):
- riesgo_pct: porcentaje del balance a arriesgar (entre 0.5% y 10%)
  * Senal muy fuerte, alta confianza, volumen alto → 3% a 8%
  * Senal moderada → 1% a 3%
  * Senal debil o dudosa → mejor HOLD
- stop_loss: nivel tecnico valido (soporte/resistencia), NUNCA arbitrario
  * Minimo 0.3% del precio actual de distancia
  * Maximo 2.5% del precio actual de distancia
- take_profit: objetivo basado en estructura de mercado, minimo ratio 1.5:1 (riesgo:beneficio)

REGLAS CRITICAS:
- Si hay posicion abierta en contra de tu nueva senal → usa CLOSE primero, en el siguiente ciclo abres la nueva
- Si vas a usar MOVE_SL → nuevo_stop_loss NUNCA puede ser peor que el SL actual para LONG (mas bajo) ni para SHORT (mas alto)
- Si la senal es HOLD → no toques nada aunque haya posicion abierta
- Siempre explica tu razonamiento tecnico con detalle

═══════════════════════════════════════
FORMATO DE RESPUESTA — SOLO JSON
═══════════════════════════════════════

Para LONG o SHORT:
{
  "accion": "LONG" o "SHORT",
  "confianza": 0.00 a 1.00,
  "riesgo_pct": 0.5 a 10,
  "stop_loss": precio numerico,
  "take_profit": precio numerico,
  "nuevo_stop_loss": null,
  "razon": "analisis detallado con ambos timeframes y justificacion del riesgo elegido"
}

Para HOLD:
{
  "accion": "HOLD",
  "confianza": 0.00 a 1.00,
  "riesgo_pct": 0,
  "stop_loss": null,
  "take_profit": null,
  "nuevo_stop_loss": null,
  "razon": "por que no es buen momento para operar"
}

Para CLOSE:
{
  "accion": "CLOSE",
  "confianza": 0.00 a 1.00,
  "riesgo_pct": 0,
  "stop_loss": null,
  "take_profit": null,
  "nuevo_stop_loss": null,
  "razon": "por que cerrar la posicion ahora"
}

Para MOVE_SL:
{
  "accion": "MOVE_SL",
  "confianza": 0.00 a 1.00,
  "riesgo_pct": 0,
  "stop_loss": null,
  "take_profit": null,
  "nuevo_stop_loss": precio numerico al que mover el SL,
  "razon": "por que mover el SL a ese nivel y que ganancia protege"
}

Responde UNICAMENTE con el JSON. Sin texto adicional, sin backticks, sin explicaciones fuera del JSON.`;

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
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

            const decision = JSON.parse(text);

            // Validaciones
            if (!['LONG', 'SHORT', 'HOLD', 'CLOSE', 'MOVE_SL'].includes(decision.accion)) {
                throw new Error(`Accion invalida: ${decision.accion}`);
            }

            decision.confianza = parseFloat(decision.confianza) || 0;
            decision.riesgo_pct = parseFloat(decision.riesgo_pct) || 1;

            // Cap de seguridad: maximo 10% de riesgo
            if (decision.riesgo_pct > 10) {
                logger.info(`IA queria arriesgar ${decision.riesgo_pct}% — limitado a 10%`);
                decision.riesgo_pct = 10;
            }

            // Validar MOVE_SL
            if (decision.accion === 'MOVE_SL' && !decision.nuevo_stop_loss) {
                throw new Error('MOVE_SL sin nuevo_stop_loss valido');
            }

            return decision;

        } catch (error) {
            const status = error.response ? error.response.status : null;
            attempt++;

            if (status === 429 || status === 503 || status === 500) {
                logger.error(`Error ${status} Gemini API. Intento ${attempt}/${retries}. Esperando 15s...`, error.message);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 15000));
                } else {
                    logger.error('Reintentos agotados para Gemini API.', error.message);
                    return null;
                }
            } else {
                logger.error('Error contactando Gemini o parseando JSON', error.message);
                return null;
            }
        }
    }
    return null;
}

module.exports = { consultarGemini, getTradeDecision: consultarGemini };
