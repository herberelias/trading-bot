const { RSI, EMA, MACD } = require('technicalindicators');

function calcularIndicadores(klines) {
    // klines structure from BingX usually is an array of objects
    // reverse so the oldest is first, latest is last if necessary, or check the order 
    // Usually it returns from latest to oldest in some APIs, let's assume chronological
    // Let's sort to ensure chronological: oldest to newest
    const sortedKlines = klines.sort((a, b) => a.time - b.time);

    const closes = sortedKlines.map(k => parseFloat(k.close));
    const volumes = sortedKlines.map(k => parseFloat(k.volume));

    const rsiInput = { values: closes, period: 14 };
    const rsiResult = RSI.calculate(rsiInput);

    const ema20Input = { values: closes, period: 20 };
    const ema20Result = EMA.calculate(ema20Input);

    const ema50Input = { values: closes, period: 50 };
    const ema50Result = EMA.calculate(ema50Input);

    const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    };
    const macdResult = MACD.calculate(macdInput);

    // Volumen vs Promedio (últimos 20 periodos por ejemplo)
    const recentVolumes = volumes.slice(-20);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const currentVolume = volumes[volumes.length - 1];
    const volumeVsAvg = ((currentVolume / avgVolume) * 100).toFixed(2);

    const latestRSI = rsiResult[rsiResult.length - 1];
    const latestEMA20 = ema20Result[ema20Result.length - 1];
    const latestEMA50 = ema50Result[ema50Result.length - 1];
    const latestMACD = macdResult[macdResult.length - 1];
    const currentPrice = closes[closes.length - 1];

    return {
        rsi: latestRSI.toFixed(2),
        ema20: latestEMA20.toFixed(2),
        ema50: latestEMA50.toFixed(2),
        macd: latestMACD.MACD.toFixed(2),
        signal: latestMACD.signal.toFixed(2),
        histogram: latestMACD.histogram.toFixed(2),
        currentPrice: currentPrice,
        volumeVsAvg: volumeVsAvg
    };
}

module.exports = { calcularIndicadores, analyze: calcularIndicadores };
