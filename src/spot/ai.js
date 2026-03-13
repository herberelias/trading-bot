require('dotenv').config();
const axios = require('axios');
const logger = require('../logger');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function consultarGeminiSpot(
    indicators15m, indicators1h, indicators4h, indicators1d,
    precioActual, balanceSpot, historialHoy,
    fearGreed, soportesResistencias, sesionMercado, racha, ultimaCompraPrecio,
    noticiasTrump
) {
    const tendencia1h = parseFloat(indicators1h.ema20) > parseFloat(indicators1h.ema50)
        ? 'ALCISTA (EMA20 > EMA50)' : 'BAJISTA (EMA20 < EMA50)';

    const tendencia4h = indicators4h
        ? (parseFloat(indicators4h.ema20) > parseFloat(indicators4h.ema50) ? 'ALCISTA' : 'BAJISTA')
        : 'No disponible';

    const tendencia1d = indicators1d
        ? (parseFloat(indicators1d.ema20) > parseFloat(indicators1d.ema50) ? 'ALCISTA' : 'BAJISTA')
        : 'No disponible';

    const rsi1h = parseFloat(indicators1h.rsi);
    const rsi15m = parseFloat(indicators15m.rsi);
    const rsi1d = indicators1d ? parseFloat(indicators1d.rsi) : 50;

    const balanceStr = `USDT disponible: ${balanceSpot.usdt.toFixed(2)} | ETH disponible: ${balanceSpot.eth.toFixed(6)} (valor: ~${(balanceSpot.eth * precioActual).toFixed(2)} USDT)`;
    const dcaStr = ultimaCompraPrecio
        ? `Último precio de compra de ETH fue a ${ultimaCompraPrecio} USDT.`
        : 'Aún no has comprado ETH (no hay precio promedio).';

    const posicionStr = balanceSpot.eth > 0.0001
        ? `Holding: ${balanceSpot.eth.toFixed(6)} ETH (~${(balanceSpot.eth * precioActual).toFixed(2)} USDT). ${dcaStr}`
        : 'Sin ETH en cartera (100% en USDT).';

    const historialStr = historialHoy.length > 0
        ? `${historialHoy.length} operaciones hoy`
        : 'Sin operaciones hoy';

    const soportesStr = soportesResistencias
        ? soportesResistencias.soportes.map(s => `  ${s.precio} USDT`).join('\n')
        : '  No calculados';
    const resistenciasStr = soportesResistencias
        ? soportesResistencias.resistencias.map(r => `  ${r.precio} USDT`).join('\n')
        : '  No calculadas';

    const fearStr = fearGreed ? `${fearGreed.value}/100 — ${fearGreed.descripcion}` : 'No disponible';
    const capitalMaxPct = process.env.CAPITAL_MAXIMO_PCT || 90;

    const prompt = `Eres un INVERSIONISTA EXPERTO en Trading SPOT de Criptomonedas.
Operas ETH-USDT en BingX SPOT. Tu objetivo es la ACUMULACION DE RIQUEZA a largo plazo.

═══════════════════════════════════════════════════
NOTICIAS RELEVANTES (Contexto Fundamental)
═══════════════════════════════════════════════════
${noticiasTrump || 'No hay noticias recientes.'}

═══════════════════════════════════════════════════
ANALISIS TECNICO (PRIORIDAD DIARIA)
═══════════════════════════════════════════════════
TIMEFRAME 1D (CRITICO): Tendencia ${tendencia1d} | RSI: ${rsi1d}
TIMEFRAME 4H: Tendencia ${tendencia4h}
TIMEFRAME 1H: Tendencia ${tendencia1h}

PRECIO ACTUAL ETH: ${precioActual} USDT

═══════════════════════════════════════════════════
REGLAS DE ORO (ESTRATEGIA PROFESIONAL — TIBURON SPOT)
═══════════════════════════════════════════════════

1. COMPRA (BUY) Y DCA INTELIGENTE:
- PRIORIDAD 1D: Si la tendencia Diaria (1D) es ALCISTA, busca compras en retrocesos de RSI 1H. No compres en picos.
- REGLA DE DISTANCIA (CRITICA): No compres si el precio no ha bajado al menos un 1.5% respecto a tu ultima compra. Evita quemar USDT en movimientos pequeños.
- GESTION DE CAPITAL: Si tu USDT es bajo (< 20% del total), SE MUCHO MAS EXIGENTE. Solo compra si el RSI 1D esta en zona de sobreventa (<40).
- capital_pct: Usa montos pequeños (10-20%) para DCA normal. Guarda el 20-40% solo para caidas fuertes en soportes diarios.

2. VENTA (SELL) PARA GANANCIAS REALES:
- PROTECCION DE PROFIT: Busca vender cuando el precio suba un 3% o 5% respecto a tu precio promedio.
- RSI 1D: Venta masiva obligatoria si RSI 1D > 75 (zona de burbuja).
- ESTRATEGIA ESCALADA: 
  * Vende el 50% al +3% de ganancia. 
  * Vende el otro 50% al +5% o si la tendencia 1D se vuelve bajista.

3. HOLD Y PACIENCIA:
- Si ya tienes ETH y el precio esta lateral, no hagas nada. Ten paciencia, deja que el mercado se mueva.
- Tu mision es ganar dinero en todo momento.

═══════════════════════════════════════════════════
RESPUESTA — SOLO JSON SIN TEXTO EXTRA
═══════════════════════════════════════════════════
BUY:  { "accion": "BUY",  "confianza": 0-1, "capital_pct": 20-90, "sell_pct": null, "precio_objetivo": numero, "stop_loss_ref": numero, "razon": "..." }
SELL: { "accion": "SELL", "confianza": 0-1, "capital_pct": null,  "sell_pct": 50-100, "precio_objetivo": null, "stop_loss_ref": null, "razon": "..." }
HOLD: { "accion": "HOLD", "confianza": 0-1, "capital_pct": null,  "sell_pct": null, "precio_objetivo": null, "stop_loss_ref": null, "razon": "..." }`;

    let retries = 3;
    let attempt = 0;
    while (attempt < retries) {
        try {
            const response = await axios.post(URL, {
                contents: [{ parts: [{ text: prompt }] }]
            }, { headers: { 'Content-Type': 'application/json' } });

            let text = response.data.candidates[0].content.parts[0].text.trim();
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

            const decision = JSON.parse(text);
            if (!['BUY', 'SELL', 'HOLD'].includes(decision.accion)) throw new Error(`Accion invalida: ${decision.accion}`);

            decision.confianza = parseFloat(decision.confianza) || 0;
            decision.capital_pct = parseFloat(decision.capital_pct) || 50;
            decision.sell_pct = parseFloat(decision.sell_pct) || 100;

            const capitalMax = parseFloat(process.env.CAPITAL_MAXIMO_PCT) || 90;
            if (decision.capital_pct > capitalMax) decision.capital_pct = capitalMax;

            return decision;
        } catch (error) {
            const status = error.response ? error.response.status : null;
            attempt++;
            if (status === 429 || status === 503 || status === 500) {
                logger.error(`[SPOT] Error ${status} Gemini. Intento ${attempt}/${retries}. Esperando 15s...`, error.message);
                if (attempt < retries) await new Promise(r => setTimeout(r, 15000));
                else return null;
            } else {
                logger.error('[SPOT] Error Gemini o JSON invalido', error.message);
                return null;
            }
        }
    }
    return null;
}

module.exports = { consultarGeminiSpot };
