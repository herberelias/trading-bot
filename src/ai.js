require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function consultarGemini(
    indicators15m, indicators1h, indicators4h,
    precioActual, posicionesAbiertas, balance, historialHoy,
    fearGreed, soportesResistencias, sesionMercado, fundingRate, racha,
    noticiasTrump
) {
    const tendencia1h = parseFloat(indicators1h.ema20) > parseFloat(indicators1h.ema50)
        ? 'ALCISTA (EMA20 > EMA50)' : 'BAJISTA (EMA20 < EMA50)';

    const tendencia4h = indicators4h
        ? (parseFloat(indicators4h.ema20) > parseFloat(indicators4h.ema50)
            ? 'ALCISTA (EMA20 > EMA50)' : 'BAJISTA (EMA20 < EMA50)')
        : 'No disponible';

    const rsi1h = parseFloat(indicators1h.rsi);
    const rsi15m = parseFloat(indicators15m.rsi);
    const rsi4h = indicators4h ? parseFloat(indicators4h.rsi) : 50;

    // Contexto de posiciones abiertas con liquidacion
    let posicionesStr = 'Ninguna';
    if (posicionesAbiertas && posicionesAbiertas.length > 0) {
        posicionesStr = posicionesAbiertas.map(p => {
            const pnlPct = p.unrealizedProfit && p.initialMargin
                ? ((parseFloat(p.unrealizedProfit) / parseFloat(p.initialMargin)) * 100).toFixed(2)
                : 'N/A';
            return [
                `  Direccion: ${p.positionSide}`,
                `  Entrada: ${p.avgPrice} USDT`,
                `  Cantidad: ${p.positionAmt}`,
                `  SL actual: ${p.stopLoss || 'no definido'}`,
                `  TP actual: ${p.takeProfit || 'no definido'}`,
                `  PnL no realizado: ${p.unrealizedProfit} USDT (${pnlPct}%)`,
                `  Margen usado: ${p.initialMargin} USDT`,
                `  Precio de LIQUIDACION: ${p.liquidationPrice} USDT (a ${p.distanciaLiquidacion} del precio de entrada)`,
                `  Tiempo abierta (horas): ${p.horas_abierta || 0}`,
            ].join('\n');
        }).join('\n---\n');
    }

    // Historial del dia
    let historialStr = 'Sin trades hoy';
    if (historialHoy && historialHoy.length > 0) {
        historialStr = `${historialHoy.length} trades hoy | ${racha ? racha.descripcion : ''}`;
    }

    // Soportes y resistencias
    const soportesStr = soportesResistencias
        ? soportesResistencias.soportes.map(s => `  ${s.precio} USDT`).join('\n')
        : '  No calculados';
    const resistenciasStr = soportesResistencias
        ? soportesResistencias.resistencias.map(r => `  ${r.precio} USDT`).join('\n')
        : '  No calculadas';

    // Funding rate
    const fundingStr = fundingRate
        ? `${fundingRate.fundingRate}% (${parseFloat(fundingRate.fundingRate) > 0.05 ? 'ALTO POSITIVO — longs pagan, señal de sobrecompra' : parseFloat(fundingRate.fundingRate) < -0.05 ? 'ALTO NEGATIVO — shorts pagan, señal de sobreventa' : 'Normal'})`
        : 'No disponible';

    // Fear & Greed
    const fearStr = fearGreed
        ? `${fearGreed.value}/100 — ${fearGreed.descripcion}`
        : 'No disponible';

    const prompt = `Eres un trader profesional experto en el mercado de FUTUROS DE ALTA RENTABILIDAD.
Operas BTC-USDT en BingX con apalancamiento ${process.env.APALANCAMIENTO}x.
Tu objetivo es MAXIMIZAR LAS GANANCIAS. No buscas trades pequeños, buscas CAPTURAR TENDENCIAS FUERTES.

═══════════════════════════════════════════════════
NOTICIAS RELEVANTES (Fundamental Context)
═══════════════════════════════════════════════════
${noticiasTrump || 'No hay noticias recientes.'}

═══════════════════════════════════════════════════
ANALISIS TECNICO MULTI-TIMEFRAME
═══════════════════════════════════════════════════
TIMEFRAME 4H (Macrotendencia): ${tendencia4h} | RSI: ${rsi4h}
TIMEFRAME 1H (Principal): ${tendencia1h} | RSI: ${rsi1h}
TIMEFRAME 15M (Ejecución): RSI: ${rsi15m} | ATR: ${indicators15m.atr}

PRECIO ACTUAL BTC: ${precioActual} USDT

═══════════════════════════════════════════════════
ESTADO DE LA CUENTA Y POSICIONES
═══════════════════════════════════════════════════
Balance disponible: ${balance} USDT
Posiciones abiertas:
${posicionesStr}

═══════════════════════════════════════════════════
REGLAS DE ORO PARA MAXIMIZAR DINERO (ESTRATEGIA TIBURON)
═══════════════════════════════════════════════════

1. ENTRADAS AGRESIVAS:
- No esperes a que todo sea perfecto si hay una ruptura de soporte/resistencia clara con volumen.
- SHORT se permite si estamos en resistencia de 1H/4H aunque 4H sea alcista, siempre que 15m/1H confirmen agotamiento.
- El apalancamiento es tu herramienta: entra con fuerza en señales de alta confianza (>80%).

2. GESTION DE RIESGO DINAMICA (RIESGO TOTAL):
- Si la señal es EXTREMADAMENTE fuerte y el sentimiento es favorable (Trump pro-crypto + volumen), puedes usar riesgo_pct de hasta el 10%. 
- En condiciones normales usa 3-5%.

3. DEJA CORRER LAS GANANCIAS (EL SECRETO):
- OBJETIVO MINIMO: 3% a 5% de movimiento de precio (sin apalancamiento). Esto equivale a 30%-50% de ganancia en cuenta.
- NO CIERRES por miedo. Solo usa CLOSE si hay un cambio de tendencia real (ej: cruce de EMAs en contra en 15m) o si el precio toca una resistencia/soporte mayor y rebota.
- PnL > 1.0% (mov. precio) → MOVE_SL a breakeven obligatoriamente. Trade gratuito.
- PnL > 2.5% (mov. precio) → MOVE_SL a +1.5% para asegurar ganancias mínimas jugosas.

4. CIERRE POR TIEMPO:
- Solo si la posicion lleva > 24 horas sin moverse y el mercado esta muerto (volumen bajo).

═══════════════════════════════════════════════════
FORMATO DE RESPUESTA — SOLO JSON SIN TEXTO EXTRA
═══════════════════════════════════════════════════
{
  "accion": "LONG" | "SHORT" | "HOLD" | "CLOSE" | "MOVE_SL",
  "confianza": 0.00 a 1.00,
  "riesgo_pct": 1 a 10,
  "stop_loss": precio numerico o null,
  "take_profit": precio numerico o null (apunta alto, resistencia de 4H o mas),
  "nuevo_stop_loss": precio numerico o null (solo para MOVE_SL),
  "razon": "analisis de tiburon: por que esta entrada capturara una tendencia grande, por que este riesgo alto y por que no cerramos aun"
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
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

            const decision = JSON.parse(text);

            if (!['LONG', 'SHORT', 'HOLD', 'CLOSE', 'MOVE_SL'].includes(decision.accion)) {
                throw new Error(`Accion invalida: ${decision.accion}`);
            }

            decision.confianza = parseFloat(decision.confianza) || 0;
            decision.riesgo_pct = parseFloat(decision.riesgo_pct) || 1;
            if (decision.riesgo_pct > 10) decision.riesgo_pct = 10;

            if (decision.accion === 'MOVE_SL' && !decision.nuevo_stop_loss) {
                throw new Error('MOVE_SL sin nuevo_stop_loss');
            }

            return decision;

        } catch (error) {
            const status = error.response ? error.response.status : null;
            attempt++;

            if (status === 429 || status === 503 || status === 500) {
                logger.error(`Error ${status} Gemini. Intento ${attempt}/${retries}. Esperando 15s...`, error.message);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 15000));
                } else {
                    logger.error('Reintentos agotados.', error.message);
                    return null;
                }
            } else {
                logger.error('Error Gemini o JSON invalido', error.message);
                return null;
            }
        }
    }
    return null;
}

module.exports = { consultarGemini, getTradeDecision: consultarGemini };
