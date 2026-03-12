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

    const prompt = `Eres un trader profesional experto en futuros perpetuos de criptomonedas con mas de 10 años de experiencia.
Operas BTC-USDT en BingX con apalancamiento ${process.env.APALANCAMIENTO}x.
Tienes LIBERTAD TOTAL: decides que hacer, cuanto arriesgar, cuando entrar, salir y mover el stop loss.

═══════════════════════════════════════════════════
NOTICIAS RELEVANTES (Contexto Fundamental)
═══════════════════════════════════════════════════
${noticiasTrump || 'No hay noticias recientes.'}

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
- Volatilidad ATR (15m): ${indicators15m.atr || 'N/A'} USDT

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
- LONG: Los 3 timeframes (4h, 1h, 15m) alineados al alza. O rebote fuerte en soporte 1h/4h.
- SHORT: No necesitas que 4h sea bajista si el precio esta en resistencia EXTREMA de 4h o 1h y el 15m+1h ya muestran debilidad (EMA20 < EMA50 en 15m). No operes SHORT si el RSI 4h esta subiendo con mucha fuerza.
- Volumen > 110% del promedio al entrar.
- RSI no en zona extrema contraria.
- Entrada LONG cerca de soporte, SHORT cerca de resistencia.
- Evitar entrar si Fear & Greed > 85 (euforia extrema) para LONG.
- Evitar entrar si Fear & Greed < 15 (panico extremo) para SHORT.

STOP LOSS:
- Siempre en nivel tecnico (soporte para LONG, resistencia para SHORT).
- Minimo 0.3% de distancia, maximo 2.5%.
- NUNCA mas alla del 80% de distancia al precio de liquidacion.

TAKE PROFIT Y CIERRE (HOLD LONGER):
- El usuario quiere mantener las posiciones mas tiempo para maximizar ganancias.
- OBJETIVO MINIMO: Busca por lo menos un 2% de movimiento del precio (sin apalancamiento) antes de considerar CLOSE por ganancias, a menos que haya un cambio de tendencia claro o se alcance una resistencia/soporte mayor.
- Para LONG: en resistencia mayor o si hay agotamiento tras un >2% de subida.
- Para SHORT: en soporte mayor o si hay agotamiento tras un >2% de caída.

MOVE_SL (gestionar posicion ganadora):
- PnL > 1.0% → mover SL a breakeven (proteccion temprana).
- PnL > 2.0% → mover SL a +1.0% (asegurar profit parcial).
- CIERRE POR TIEMPO: Solo ordena CLOSE si la posicion lleva > 12 horas estancada o en contra pero sin tocar SL. Si hay tendencia a favor, MANTEN LA POSICION.

RIESGO POR TRADE (riesgo_pct):
- Alta conviccion + indicadores alineados + volumen alto → hasta 8%
- Condiciones moderadas → 1% a 3%
- Cualquier duda → HOLD

═══════════════════════════════════════════════════
FORMATO DE RESPUESTA — SOLO JSON SIN TEXTO EXTRA
═══════════════════════════════════════════════════

{
  "accion": "LONG" | "SHORT" | "HOLD" | "CLOSE" | "MOVE_SL",
  "confianza": 0.00 a 1.00,
  "riesgo_pct": 0.5 a 10,
  "stop_loss": precio numerico o null,
  "take_profit": precio numerico o null,
  "nuevo_stop_loss": precio numerico o null (solo para MOVE_SL),
  "razon": "analisis completo: timeframes, niveles clave, noticias de Trump, por que este riesgo_pct y por que se mantiene o cierra la posicion"
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
