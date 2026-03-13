require('dotenv').config();
const axios = require('axios');
const db = require('./db');
const logger = require('./logger');

// Fear & Greed Index de Alternative.me (API publica gratuita)
async function getFearAndGreed() {
    try {
        const response = await axios.get('https://api.alternative.me/fng/?limit=1', {
            timeout: 5000
        });
        const data = response.data.data[0];
        return {
            value: parseInt(data.value),
            label: data.value_classification,
            // Traduccion al español
            descripcion: traducirFearGreed(data.value_classification)
        };
    } catch (error) {
        logger.error('Error obteniendo Fear & Greed', error.message);
        return { value: 50, label: 'Neutral', descripcion: 'Neutral (sin datos)' };
    }
}

function traducirFearGreed(label) {
    const map = {
        'Extreme Fear': 'Miedo Extremo (posible rebote)',
        'Fear': 'Miedo (mercado nervioso)',
        'Neutral': 'Neutral',
        'Greed': 'Codicia (mercado optimista)',
        'Extreme Greed': 'Codicia Extrema (posible corrección)'
    };
    return map[label] || label;
}

// Calcular soporte y resistencia automaticos basados en maximos/minimos recientes
function calcularSoportesResistencias(klines, periodos = 20) {
    const sorted = [...klines].sort((a, b) => a.time - b.time);
    const recientes = sorted.slice(-periodos);

    const highs = recientes.map(k => parseFloat(k.high));
    const lows = recientes.map(k => parseFloat(k.low));
    const closes = recientes.map(k => parseFloat(k.close));

    // Maximo y minimo de los ultimos N periodos
    const maxReciente = Math.max(...highs);
    const minReciente = Math.min(...lows);
    const precioActual = closes[closes.length - 1];

    // Niveles de soporte y resistencia por pivots
    const pivots = [];
    for (let i = 2; i < recientes.length - 2; i++) {
        // Pivot alto (resistencia)
        if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
            highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
            pivots.push({ tipo: 'RESISTENCIA', precio: parseFloat(highs[i].toFixed(2)) });
        }
        // Pivot bajo (soporte)
        if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
            lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
            pivots.push({ tipo: 'SOPORTE', precio: parseFloat(lows[i].toFixed(2)) });
        }
    }

    // Filtrar los mas cercanos al precio actual
    const soportes = pivots
        .filter(p => p.tipo === 'SOPORTE' && p.precio < precioActual)
        .sort((a, b) => b.precio - a.precio)
        .slice(0, 3);

    const resistencias = pivots
        .filter(p => p.tipo === 'RESISTENCIA' && p.precio > precioActual)
        .sort((a, b) => a.precio - b.precio)
        .slice(0, 3);

    return {
        soportes: soportes.length > 0 ? soportes : [{ tipo: 'SOPORTE', precio: minReciente.toFixed(2) }],
        resistencias: resistencias.length > 0 ? resistencias : [{ tipo: 'RESISTENCIA', precio: maxReciente.toFixed(2) }],
        max24h: maxReciente.toFixed(2),
        min24h: minReciente.toFixed(2)
    };
}

// Obtener sesion de mercado actual segun hora UTC
function getSesionMercado() {
    const horaUTC = new Date().getUTCHours();

    let sesion = '';
    let descripcion = '';
    let actividad = '';

    if (horaUTC >= 0 && horaUTC < 7) {
        sesion = 'ASIA';
        descripcion = 'Sesión asiática (Tokio/Shanghai)';
        actividad = 'BAJA — volumen reducido, movimientos lentos';
    } else if (horaUTC >= 7 && horaUTC < 9) {
        sesion = 'TRANSICION_EUROPA';
        descripcion = 'Apertura europea';
        actividad = 'MEDIA-ALTA — aumento de volumen, posibles breakouts';
    } else if (horaUTC >= 9 && horaUTC < 13) {
        sesion = 'EUROPA';
        descripcion = 'Sesión europea activa (Londres)';
        actividad = 'ALTA — buen momento para operar';
    } else if (horaUTC >= 13 && horaUTC < 16) {
        sesion = 'OVERLAP_EU_US';
        descripcion = 'Overlap Europa + Nueva York';
        actividad = 'MUY ALTA — mayor volumen del dia, mejores oportunidades';
    } else if (horaUTC >= 16 && horaUTC < 21) {
        sesion = 'NUEVA_YORK';
        descripcion = 'Sesión Nueva York';
        actividad = 'ALTA — buen momento para operar';
    } else {
        sesion = 'CIERRE_NY';
        descripcion = 'Cierre Nueva York / Pre-Asia';
        actividad = 'BAJA — volumen reduciéndose, evitar entradas nuevas';
    }

    return {
        sesion,
        descripcion,
        actividad,
        horaUTC: `${horaUTC}:00 UTC`
    };
}

// Calcular racha actual de trades (wins/losses consecutivos)
async function getRachaActual(user = null) {
    try {
        const userId = user ? user.id : 1;
        const modo = user ? (user.modo_real ? 'REAL' : 'SIMULADO') : (process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO');

        const queryHistory = `
            SELECT id, direccion AS accion, capital_usado, timestamp_apertura, timestamp_cierre, resultado, ganancia_perdida
            FROM bot_trades
            WHERE modo = ? AND user_id = ?
            ORDER BY timestamp_apertura DESC
            LIMIT 10
        `;
        const [rows] = await db.execute(queryHistory, [modo, userId]);

        if (!rows || rows.length === 0) {
            return { racha: 0, tipo: 'SIN_HISTORIAL', descripcion: 'Sin trades previos', ultimoCerrado: null };
        }

        const hoy = new Date().toISOString().split('T')[0];
        const tradesHoy = rows.filter(r => r.timestamp_apertura && r.timestamp_apertura.toISOString().includes(hoy));
        
        // Obtener el último trade cerrado para detectar SL reciente
        const ultimoCerrado = rows.find(r => r.timestamp_cierre !== null);

        return {
            totalRecientes: rows.length,
            tradesHoy: tradesHoy.length,
            descripcion: `${tradesHoy.length} trades hoy, ${rows.length} trades recientes en total`,
            ultimoCerrado: ultimoCerrado ? {
                accion: ultimoCerrado.accion,
                resultado: ultimoCerrado.resultado,
                cerradoHace: Math.round((Date.now() - new Date(ultimoCerrado.timestamp_cierre)) / 60000), // minutos
                pnl: ultimoCerrado.ganancia_perdida
            } : null
        };
    } catch (error) {
        logger.error('Error obteniendo racha', error.message);
        return { racha: 0, tipo: 'ERROR', descripcion: 'Sin datos de racha', ultimoCerrado: null };
    }
}

module.exports = {
    getFearAndGreed,
    calcularSoportesResistencias,
    getSesionMercado,
    getRachaActual
};
