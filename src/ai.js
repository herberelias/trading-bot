require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function consultarGemini(
    indicators15m, indicators1h, indicators4h,
    precioActual, posicionesAbiertas, balance, historialHoy,
    fearGreed, soportesResistencias, sesionMercado, fundingRate, racha
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

    const prompt = `Eres un trader profesional experto en futuros perpetuos de criptomonedas con mas de 10 años de experiencia.
Operas BTC-USDT en BingX con apalancamiento ${process.env.APALANCAMIENTO}x.
Tienes LIBERTAD TOTAL: decides que hacer, cuanto arriesgar, cuando entrar, salir y mover el stop loss.

═══════════════════════════════════════════════════
ANALISIS TECNICO MULTI-TIMEFRAME
═══════════════════════════════════════════════════

TIMEFRAME 4H (macro tendencia):
- Tendencia: ${tendencia4h}
- RSI(14): ${indicators4h ? indicators4h.rsi : 'N/A'} ${rsi4h > 70 ? '[SOBRECOMPRADO]' : rsi4h < 30 ? '[SOBREVENDIDO]' : ''}
- EMA20: ${indicators4h ? indicators4h.ema20 : 'N/A'} | EMA50: ${indicators4h ? indicators4h.ema50 : 'N/A'}
- MACD Histogram: ${indicators4h ? indicators4h.histogram : 'N/A'} ${indicators4h && parseFloat(indicators4h.histogram) > 0 ? '(momentum alcista)' : '(momentum bajista)'}
- Bollinger: precio en ${indicators4h ? indicators4h.bb_position : 'N/A'} | Ancho banda: ${indicators4h ? indicators4h.bb_width : 'N/A'}%

TIMEFRAME 1H (tendencia principal):
- Tendencia: ${tendencia1h}
- RSI(14): ${indicators1h.rsi} ${rsi1h > 70 ? '[SOBRECOMPRADO]' : rsi1h < 30 ? '[SOBREVENDIDO]' : ''}
- EMA20: ${indicators1h.ema20} | EMA50: ${indicators1h.ema50}
- MACD: ${indicators1h.macd} | Signal: ${indicators1h.signal} | Histogram: ${indicators1h.histogram}
- Bollinger: precio en ${indicators1h.bb_position} | Superior: ${indicators1h.bb_upper} | Inferior: ${indicators1h.bb_lower} | Ancho: ${indicators1h.bb_width}%

TIMEFRAME 15M (señal de entrada):
- RSI(14): ${indicators15m.rsi} ${rsi15m > 70 ? '[SOBRECOMPRADO]' : rsi15m < 30 ? '[SOBREVENDIDO]' : ''}
- EMA20: ${indicators15m.ema20} | EMA50: ${indicators15m.ema50}
- MACD: ${indicators15m.macd} | Signal: ${indicators15m.signal} | Histogram: ${indicators15m.histogram}
- Bollinger: precio en ${indicators15m.bb_position} | Superior: ${indicators15m.bb_upper} | Inferior: ${indicators15m.bb_lower} | Ancho: ${indicators15m.bb_width}%
- Volumen vs promedio: ${indicators15m.volumeVsAvg}%

PRECIO ACTUAL BTC: ${precioActual} USDT

═══════════════════════════════════════════════════
NIVELES CLAVE DE PRECIO
═══════════════════════════════════════════════════

RESISTENCIAS (precio debe superar para subir):
${resistenciasStr}

SOPORTES (precio debe defender para no caer):
${soportesStr}

Max 24h: ${soportesResistencias ? soportesResistencias.max24h : 'N/A'} USDT
Min 24h: ${soportesResistencias ? soportesResistencias.min24h : 'N/A'} USDT

═══════════════════════════════════════════════════
SENTIMIENTO Y CONDICIONES DE MERCADO
═══════════════════════════════════════════════════

Indice Miedo y Codicia: ${fearStr}
Funding Rate: ${fundingStr}
Sesion de mercado: ${sesionMercado ? sesionMercado.descripcion : 'N/A'} — Actividad: ${sesionMercado ? sesionMercado.actividad : 'N/A'}

═══════════════════════════════════════════════════
ESTADO DE LA CUENTA
═══════════════════════════════════════════════════

Balance disponible: ${balance} USDT
Apalancamiento: ${process.env.APALANCAMIENTO}x
Modo: ${process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO'}

Posiciones abiertas:
${posicionesStr}

Performance hoy: ${historialStr}

═══════════════════════════════════════════════════
ACCIONES DISPONIBLES
═══════════════════════════════════════════════════

1. LONG    — Abrir posicion larga
2. SHORT   — Abrir posicion corta
3. HOLD    — No hacer nada
4. CLOSE   — Cerrar todas las posiciones abiertas
5. MOVE_SL — Mover stop loss de posicion abierta

═══════════════════════════════════════════════════
CRITERIOS PROFESIONALES
═══════════════════════════════════════════════════

ENTRADAS (LONG/SHORT):
- Los 3 timeframes (4h, 1h, 15m) alineados en la misma direccion
- Volumen > 110% del promedio
- RSI no en zona extrema contraria
- Precio NO tocando banda de Bollinger opuesta
- Entrada LONG cerca de soporte, SHORT cerca de resistencia
- Evitar entrar si Fear & Greed > 85 (euforia extrema) para LONG
- Evitar entrar si Fear & Greed < 15 (panico extremo) para SHORT
- Sesion de baja actividad (ASIA o CIERRE_NY) → ser mas conservador o HOLD
- Funding rate > 0.1% positivo → cuidado con LONG (mercado saturado de longs)

STOP LOSS:
- Siempre en nivel tecnico (soporte para LONG, resistencia para SHORT)
- Minimo 0.3% de distancia, maximo 2.5%
- Para LONG: justo debajo del soporte mas cercano
- Para SHORT: justo encima de la resistencia mas cercana
- NUNCA mas alla del 80% de distancia al precio de liquidacion

TAKE PROFIT:
- Minimo ratio 2:1 (riesgo:beneficio)
- Para LONG: en la resistencia mas cercana o siguiente nivel
- Para SHORT: en el soporte mas cercano o siguiente nivel

MOVE_SL (gestionar posicion ganadora):
- PnL > 0.8% → mover SL a breakeven (precio de entrada exacto)
- PnL > 1.5% → mover SL a +0.5% sobre entrada (ganancia minima garantizada)
- PnL > 3% → trailing agresivo, SL al precio actual menos 1%
- PnL > 5% → trailing muy agresivo, SL al precio actual menos 0.5%
- Si el precio se acerca mucho a liquidacion → CLOSE inmediato
- NUNCA mover SL en direccion que aumente la perdida potencial

RIESGO POR TRADE (riesgo_pct):
- Sesion MUY ALTA + 3 timeframes alineados + volumen alto + fear&greed favorable → hasta 8%
- Condiciones buenas pero no perfectas → 2% a 4%
- Señal moderada, sesion baja o indicadores mixtos → 0.5% a 1.5%
- Cualquier duda → HOLD

═══════════════════════════════════════════════════
TRAILING STOP LOSS
═══════════════════════════════════════════════════

Al abrir LONG o SHORT debes decidir el trailing_pct.
El trailing stop se coloca en BingX y protege la posicion segundo a segundo.
Junto con el stop_loss inicial, el trailing reemplaza el SL dinamicamente.

CRITERIOS para trailing_pct:
- Señal muy fuerte, tendencia clara, alta conviccion → 0.5% a 0.8% (ajustado, protege mas)
- Señal moderada, algo de volatilidad → 1.0% a 1.5% (balance entre proteccion y espacio)
- Señal con dudas, alta volatilidad detectada → 2.0% a 3.0% (da mas espacio al precio)
- Sesion de alta volatilidad (overlap EU/NY) → sumar 0.3% al trailing
- RSI extremo (>75 o <25) → sumar 0.2% (mas espacio para correccion)

EJEMPLO: Si el precio es 70000 y trailing_pct=1.0%:
- Si BTC sube a 72000, el trailing SL queda en 71280 (72000 * 0.99)
- Si BTC cae desde 72000 a 71280 → posicion se cierra con ganancia

═══════════════════════════════════════════════════
FORMATO DE RESPUESTA — SOLO JSON SIN TEXTO EXTRA
═══════════════════════════════════════════════════

{
  "accion": "LONG" | "SHORT" | "HOLD" | "CLOSE" | "MOVE_SL",
  "confianza": 0.00 a 1.00,
  "riesgo_pct": 0 a 10,
  "stop_loss": precio numerico o null,
  "take_profit": precio numerico o null,
  "trailing_pct": 0.5 a 3.0,
  "trailing_pct": 0.5 a 3.0,
  "nuevo_stop_loss": precio numerico o null (solo para MOVE_SL),
  "razon": "analisis completo: timeframes, niveles clave, sentimiento, sesion, por que este riesgo_pct y trailing_pct"
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
