require('dotenv').config();
const axios = require('axios');
const logger = require('../logger');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function consultarGeminiSpot(
    indicators15m, indicators1h, indicators4h,
    precioActual, balanceSpot, historialHoy,
    fearGreed, soportesResistencias, sesionMercado, racha, ultimaCompraPrecio
) {
    const tendencia1h = parseFloat(indicators1h.ema20) > parseFloat(indicators1h.ema50)
        ? 'ALCISTA (EMA20 > EMA50)' : 'BAJISTA (EMA20 < EMA50)';

    const tendencia4h = indicators4h
        ? (parseFloat(indicators4h.ema20) > parseFloat(indicators4h.ema50) ? 'ALCISTA' : 'BAJISTA')
        : 'No disponible';

    const rsi1h = parseFloat(indicators1h.rsi);
    const rsi15m = parseFloat(indicators15m.rsi);

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
    const capitalMaxPct = process.env.CAPITAL_MAXIMO_PCT || 80;

    const prompt = `Eres un trader profesional especializado en trading spot de criptomonedas.
Operas ETH-USDT en BingX SPOT (sin apalancamiento, sin liquidacion).
Tu objetivo es acumular USDT comprando ETH barato y vendiendo caro.
Tienes LIBERTAD TOTAL para decidir cuando comprar, cuanto, cuando vender y cuanto.

REGLAS SPOT (MUY IMPORTANTE):
- Solo puedes BUY (comprar ETH), SELL (vender ETH) o HOLD
- NO hay SHORT, NO hay apalancamiento, NO hay liquidacion
- stop_loss_ref es referencial — si el precio baja a ese nivel decides SELL en el siguiente ciclo
- Puedes tomar ganancias parciales (sell_pct < 100)
- ESTRATEGIA DCA (Dollar Cost Averaging):
  Si el precio actual es más bajo que tu ultimo precio de compra (promediar a la baja), y la tendencia sigue siendo alcista pero con un retroceso, usa un porcentaje de USDT (capital_pct) para promediar.
  Si el precio bajó un poco, usa 20-30%. Si cayó bruscamente a un soporte clave, usa 40-50%.
  ¡Divide tus compras! No uses el 100% del capital en una sola entrada si acabas de comprar.

═══════════════════════════════════════════════════
ANALISIS TECNICO — ETH-USDT
═══════════════════════════════════════════════════

TIMEFRAME 4H (macro):
- Tendencia: ${tendencia4h}
- RSI: ${indicators4h ? indicators4h.rsi : 'N/A'} | EMA20: ${indicators4h ? indicators4h.ema20 : 'N/A'} | EMA50: ${indicators4h ? indicators4h.ema50 : 'N/A'}
- Bollinger: ${indicators4h ? indicators4h.bb_position : 'N/A'} | Ancho: ${indicators4h ? indicators4h.bb_width : 'N/A'}%

TIMEFRAME 1H:
- Tendencia: ${tendencia1h}
- RSI: ${indicators1h.rsi} ${rsi1h > 70 ? '[SOBRECOMPRADO]' : rsi1h < 30 ? '[SOBREVENDIDO]' : ''}
- EMA20: ${indicators1h.ema20} | EMA50: ${indicators1h.ema50}
- MACD: ${indicators1h.macd} | Histogram: ${indicators1h.histogram}
- Bollinger: ${indicators1h.bb_position} | Superior: ${indicators1h.bb_upper} | Inferior: ${indicators1h.bb_lower}

TIMEFRAME 15M:
- RSI: ${indicators15m.rsi} ${rsi15m > 70 ? '[SOBRECOMPRADO]' : rsi15m < 30 ? '[SOBREVENDIDO]' : ''}
- EMA20: ${indicators15m.ema20} | EMA50: ${indicators15m.ema50}
- MACD: ${indicators15m.macd} | Histogram: ${indicators15m.histogram}
- Bollinger: ${indicators15m.bb_position} | Superior: ${indicators15m.bb_upper} | Inferior: ${indicators15m.bb_lower}
- Volumen vs promedio: ${indicators15m.volumeVsAvg}%

PRECIO ACTUAL ETH: ${precioActual} USDT

RESISTENCIAS:
${resistenciasStr}

SOPORTES:
${soportesStr}

Max/Min 24h: ${soportesResistencias ? soportesResistencias.max24h : 'N/A'} / ${soportesResistencias ? soportesResistencias.min24h : 'N/A'} USDT

═══════════════════════════════════════════════════
SENTIMIENTO
═══════════════════════════════════════════════════

Fear & Greed: ${fearStr}
Sesion: ${sesionMercado ? sesionMercado.descripcion : 'N/A'} — ${sesionMercado ? sesionMercado.actividad : 'N/A'}

═══════════════════════════════════════════════════
CUENTA SPOT
═══════════════════════════════════════════════════

${balanceStr}
Posicion: ${posicionStr}
Hoy: ${historialStr}
Capital maximo permitido: ${capitalMaxPct}% del USDT

═══════════════════════════════════════════════════
CRITERIOS
═══════════════════════════════════════════════════

BUY (comprar ETH o hacer DCA):
- 4h y 1h alcistas + 15m confirma
- DCA (Dollar Cost Averaging): Si el precio actual es MENOR a tu ultimo precio de compra, y rebotó en un soporte, realiza compras parciales para bajar el costo promedio.
- Precio cerca de soporte o banda inferior Bollinger
- RSI < 65, volumen > 100% promedio
- Fear & Greed < 85
- capital_pct: usa 15-30% para primera entrada o pequeños DCA. Usa 40-80% solo si la señal es extremadamente fuerte o el precio colapsó a un soporte de 4h.

SELL (vender ETH):
- El precio actual SUPERÓ tu último precio de compra y llegó a una resistencia clave o banda superior Bollinger.
- Toma de ganancias (Take Profit): Vender parcialmente (sell_pct: 50-70%) si la señal no es fatal.
- RSI > 70 con señal de debilidad en el MACD.
- STOP LOSS VIRTUAL: Si el precio cayó DEBAJO de tu stop_loss_ref, y la tendencia (1H y 4H) cambió a bajista, haz SELL (sell_pct 100%) para proteger capital.

HOLD: señal no clara, ya tienes ETH y tendencia sigue alcista, o no tienes ETH y esperas mejor entrada

═══════════════════════════════════════════════════
RESPUESTA — SOLO JSON
═══════════════════════════════════════════════════

BUY:  { "accion": "BUY",  "confianza": 0-1, "capital_pct": 15-80, "sell_pct": null, "precio_objetivo": numero, "stop_loss_ref": numero, "razon": "..." }
SELL: { "accion": "SELL", "confianza": 0-1, "capital_pct": null,  "sell_pct": 25-100, "precio_objetivo": null, "stop_loss_ref": null, "razon": "..." }
HOLD: { "accion": "HOLD", "confianza": 0-1, "capital_pct": null,  "sell_pct": null, "precio_objetivo": null, "stop_loss_ref": null, "razon": "..." }

Sin texto extra ni backticks.`;

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

            const capitalMax = parseFloat(process.env.CAPITAL_MAXIMO_PCT) || 80;
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
