const { RSI, EMA, MACD, BollingerBands } = require('technicalindicators');

function calcularIndicadores(klines) {
    const sortedKlines = klines.sort((a, b) => a.time - b.time);
    const closes = sortedKlines.map(k => parseFloat(k.close));
    const highs = sortedKlines.map(k => parseFloat(k.high));
    const lows = sortedKlines.map(k => parseFloat(k.low));
    const volumes = sortedKlines.map(k => parseFloat(k.volume));

    // RSI
    const rsiResult = RSI.calculate({ values: closes, period: 14 });

    // EMAs
    const ema20Result = EMA.calculate({ values: closes, period: 20 });
    const ema50Result = EMA.calculate({ values: closes, period: 50 });

    // MACD
    const macdResult = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });

    // Bollinger Bands (periodo 20, desviacion 2)
    const bbResult = BollingerBands.calculate({
        values: closes,
        period: 20,
        stdDev: 2
    });

    // Volumen vs promedio ultimos 20 periodos
    const recentVolumes = volumes.slice(-20);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const currentVolume = volumes[volumes.length - 1];
    const volumeVsAvg = ((currentVolume / avgVolume) * 100).toFixed(2);

    // Valores actuales
    const latestRSI = rsiResult[rsiResult.length - 1];
    const latestEMA20 = ema20Result[ema20Result.length - 1];
    const latestEMA50 = ema50Result[ema50Result.length - 1];
    const latestMACD = macdResult[macdResult.length - 1];
    const latestBB = bbResult[bbResult.length - 1];
    const currentPrice = closes[closes.length - 1];

    // Posicion del precio dentro de las Bandas de Bollinger
    let bbPosition = 'MEDIO';
    const bbRange = latestBB.upper - latestBB.lower;
    const bbPct = ((currentPrice - latestBB.lower) / bbRange * 100).toFixed(1);
    if (currentPrice >= latestBB.upper) bbPosition = 'BANDA_SUPERIOR (sobrecompra potencial)';
    else if (currentPrice <= latestBB.lower) bbPosition = 'BANDA_INFERIOR (sobreventa potencial)';
    else if (parseFloat(bbPct) > 70) bbPosition = 'CERCA_SUPERIOR';
    else if (parseFloat(bbPct) < 30) bbPosition = 'CERCA_INFERIOR';

    // Ancho de banda (volatilidad)
    const bbWidth = ((bbRange / latestBB.middle) * 100).toFixed(2);

    return {
        rsi: latestRSI.toFixed(2),
        ema20: latestEMA20.toFixed(2),
        ema50: latestEMA50.toFixed(2),
        macd: latestMACD.MACD.toFixed(2),
        signal: latestMACD.signal.toFixed(2),
        histogram: latestMACD.histogram.toFixed(2),
        currentPrice,
        volumeVsAvg,
        // Bollinger Bands
        bb_upper: latestBB.upper.toFixed(2),
        bb_middle: latestBB.middle.toFixed(2),
        bb_lower: latestBB.lower.toFixed(2),
        bb_position: bbPosition,
        bb_width: bbWidth,
        bb_pct: bbPct
    };
}

module.exports = { calcularIndicadores, analyze: calcularIndicadores };
