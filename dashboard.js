require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const app = express();
const PORT = process.env.PORT || 3004;

const DASH_USER = process.env.DASHBOARD_USER || 'admin';
const DASH_PASS = process.env.DASHBOARD_PASS || 'trading123';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'trading-bot-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// ═══════════════════════════════════════════
// MIDDLEWARE AUTH
// ═══════════════════════════════════════════
function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.redirect('/login');
}

// ═══════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════
const loginHTML = (error = '') => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trading Bot — Login</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Inter', sans-serif;
    background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 380px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
  .logo {
    text-align: center;
    margin-bottom: 28px;
  }
  .logo-icon {
    width: 52px; height: 52px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    margin-bottom: 12px;
  }
  h1 { font-size: 1.3rem; font-weight: 700; color: #111; }
  p { font-size: 0.85rem; color: #6b7280; margin-top: 4px; }
  label { display: block; font-size: 0.82rem; font-weight: 500; color: #374151; margin-bottom: 6px; margin-top: 16px; }
  input {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid #e5e7eb;
    border-radius: 8px;
    font-size: 0.9rem;
    font-family: 'Inter', sans-serif;
    outline: none;
    transition: border-color 0.2s;
  }
  input:focus { border-color: #4f46e5; }
  button {
    width: 100%;
    padding: 11px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    margin-top: 20px;
    transition: opacity 0.2s;
  }
  button:hover { opacity: 0.9; }
  .error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.82rem;
    margin-top: 14px;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-icon">📊</div>
    <h1>Trading Bot</h1>
    <p>Panel de Control</p>
  </div>
  <form method="POST" action="/login">
    <label>Usuario</label>
    <input type="text" name="username" placeholder="admin" required>
    <label>Contraseña</label>
    <input type="password" name="password" placeholder="••••••••" required>
    ${error ? `<div class="error">❌ ${error}</div>` : ''}
    <button type="submit">Ingresar</button>
  </form>
</div>
</body>
</html>`;

// ═══════════════════════════════════════════
// DASHBOARD HTML
// ═══════════════════════════════════════════
const dashboardHTML = (data, period) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trading Bot Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --text2: #64748b;
    --text3: #94a3b8;
    --primary: #4f46e5;
    --primary-light: #eef2ff;
    --green: #10b981;
    --green-light: #ecfdf5;
    --red: #ef4444;
    --red-light: #fef2f2;
    --yellow: #f59e0b;
    --yellow-light: #fffbeb;
    --blue: #3b82f6;
    --blue-light: #eff6ff;
    --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  }
  body {
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  /* HEADER */
  .header {
    background: white;
    border-bottom: 1px solid var(--border);
    padding: 0 20px;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .header-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 56px;
  }
  .header-left { display: flex; align-items: center; gap: 10px; }
  .logo-sm {
    width: 32px; height: 32px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .header h1 { font-size: 0.95rem; font-weight: 700; }
  .live-badge {
    display: flex; align-items: center; gap: 5px;
    background: var(--green-light);
    color: var(--green);
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .live-dot {
    width: 6px; height: 6px;
    background: var(--green);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .update-time { font-size: 0.72rem; color: var(--text3); }
  .logout-btn {
    font-size: 0.78rem; color: var(--text2);
    text-decoration: none; padding: 4px 10px;
    border: 1px solid var(--border); border-radius: 6px;
    transition: all 0.15s;
  }
  .logout-btn:hover { background: var(--bg); color: var(--text); }

  /* MAIN */
  .main { max-width: 1200px; margin: 0 auto; padding: 20px; }

  /* TABS */
  .tabs {
    display: flex; gap: 4px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 4px;
    margin-bottom: 20px;
  }
  .tab {
    flex: 1; padding: 8px;
    text-align: center;
    border-radius: 7px;
    font-size: 0.82rem; font-weight: 500;
    cursor: pointer; transition: all 0.15s;
    color: var(--text2);
    border: none; background: none;
    font-family: 'Inter', sans-serif;
  }
  .tab.active { background: var(--primary); color: white; }

  /* CARDS */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    box-shadow: var(--shadow);
  }
  .card-title {
    font-size: 0.72rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--text3); margin-bottom: 12px;
  }

  /* GRID */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
  .full { grid-column: 1 / -1; }
  .mb12 { margin-bottom: 12px; }

  /* METRIC CARDS */
  .metric { }
  .metric-value {
    font-size: 1.6rem; font-weight: 800;
    line-height: 1; margin-bottom: 4px;
  }
  .metric-label { font-size: 0.75rem; color: var(--text2); }
  .metric-change {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 0.72rem; font-weight: 600;
    padding: 2px 7px; border-radius: 20px;
    margin-top: 6px;
  }
  .change-up { background: var(--green-light); color: var(--green); }
  .change-down { background: var(--red-light); color: var(--red); }
  .change-neutral { background: var(--bg); color: var(--text2); }

  /* COLORS */
  .text-green { color: var(--green); }
  .text-red { color: var(--red); }
  .text-blue { color: var(--blue); }
  .text-yellow { color: var(--yellow); }
  .text-primary { color: var(--primary); }
  .text-muted { color: var(--text2); }

  /* BADGES */
  .badge {
    display: inline-flex; align-items: center;
    padding: 3px 9px; border-radius: 6px;
    font-size: 0.72rem; font-weight: 600;
    letter-spacing: 0.3px;
  }
  .badge-long, .badge-buy { background: var(--green-light); color: var(--green); }
  .badge-short, .badge-sell { background: var(--red-light); color: var(--red); }
  .badge-hold { background: var(--bg); color: var(--text2); }
  .badge-real { background: #fef3c7; color: #d97706; }
  .badge-sim { background: var(--blue-light); color: var(--blue); }

  /* POSITION BOX */
  .pos-box {
    background: var(--bg);
    border-radius: 8px; padding: 12px;
  }
  .pos-row {
    display: flex; justify-content: space-between;
    font-size: 0.82rem; padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .pos-row:last-child { border-bottom: none; }
  .pos-label { color: var(--text2); }
  .pos-val { font-weight: 600; }
  .no-data {
    text-align: center; color: var(--text3);
    font-size: 0.82rem; padding: 20px;
  }

  /* TRADE TABLE */
  .trade-item {
    display: flex; justify-content: space-between;
    align-items: center; padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .trade-item:last-child { border-bottom: none; }
  .trade-left { display: flex; align-items: center; gap: 10px; }
  .trade-icon {
    width: 34px; height: 34px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .icon-buy, .icon-long { background: var(--green-light); }
  .icon-sell, .icon-short { background: var(--red-light); }
  .icon-hold { background: var(--bg); }
  .trade-par { font-size: 0.85rem; font-weight: 600; }
  .trade-time { font-size: 0.72rem; color: var(--text3); margin-top: 1px; }
  .trade-right { text-align: right; }
  .trade-price { font-size: 0.85rem; font-weight: 600; }
  .trade-qty { font-size: 0.72rem; color: var(--text3); margin-top: 1px; }

  /* STATS ROW */
  .stat-item {
    display: flex; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid var(--border);
    font-size: 0.83rem;
  }
  .stat-item:last-child { border-bottom: none; }
  .stat-key { color: var(--text2); }
  .stat-val { font-weight: 600; }

  /* WIN RATE BAR */
  .wr-bar-wrap {
    height: 8px; background: var(--border);
    border-radius: 10px; margin: 8px 0; overflow: hidden;
  }
  .wr-bar {
    height: 100%; border-radius: 10px;
    background: linear-gradient(90deg, var(--green), #34d399);
    transition: width 0.5s ease;
  }

  /* AI DECISION */
  .ai-reason {
    background: var(--bg); border-radius: 8px;
    padding: 12px; font-size: 0.8rem;
    color: var(--text2); line-height: 1.6;
    max-height: 120px; overflow-y: auto;
    margin-top: 8px;
  }

  /* CHART */
  .chart-wrap { position: relative; height: 200px; margin-top: 8px; }

  /* DIVIDER */
  .section-label {
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1px;
    color: var(--text3); margin: 16px 0 10px;
    display: flex; align-items: center; gap: 8px;
  }
  .section-label::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }

  /* REFRESH */
  .refresh-row {
    display: flex; justify-content: space-between;
    align-items: center; margin-top: 16px;
  }
  .refresh-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 16px;
    background: var(--primary); color: white;
    border: none; border-radius: 8px;
    font-size: 0.82rem; font-weight: 600;
    font-family: 'Inter', sans-serif;
    cursor: pointer; transition: opacity 0.15s;
  }
  .refresh-btn:hover { opacity: 0.9; }
  .auto-text { font-size: 0.72rem; color: var(--text3); }

  /* RESPONSIVE */
  @media (max-width: 600px) {
    .grid-4 { grid-template-columns: 1fr 1fr; }
    .grid-3 { grid-template-columns: 1fr 1fr; }
    .main { padding: 12px; }
    .metric-value { font-size: 1.3rem; }
  }

  /* SECTION */
  .section { display: none; }
  .section.active { display: block; }
</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div class="header-left">
      <div class="logo-sm">📊</div>
      <h1>Trading Bot</h1>
      <div class="live-badge"><div class="live-dot"></div>LIVE</div>
    </div>
    <div class="header-right">
      <select id="periodFilter" onchange="window.location.href='/?period='+this.value" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 0.8rem; background: var(--bg); cursor: pointer; outline: none; margin-right: 15px;">
        <option value="today" ${period === 'today' ? 'selected' : ''}>Hoy</option>
        <option value="7days" ${period === '7days' ? 'selected' : ''}>Últimos 7 Días</option>
        <option value="30days" ${period === '30days' ? 'selected' : ''}>Últimos 30 Días</option>
        <option value="all" ${period === 'all' ? 'selected' : ''}>Desde el inicio</option>
      </select>
      <span class="update-time">🕐 ${data.timestamp}</span>
      <a href="/logout" class="logout-btn">Salir</a>
    </div>
  </div>
</div>

<div class="main">

  <!-- TABS -->
  <div class="tabs">
    <button class="tab active" onclick="showTab('resumen', this)">Resumen</button>
    <button class="tab" onclick="showTab('futuros', this)">Futuros BTC</button>
    <button class="tab" onclick="showTab('spot', this)">Spot ETH</button>
    <button class="tab" onclick="showTab('estadisticas', this)">Estadísticas</button>
  </div>

  <!-- ══════════════════════════════════════ -->
  <!-- TAB: RESUMEN -->
  <!-- ══════════════════════════════════════ -->
  <div class="section active" id="tab-resumen">

    <!-- Balance total -->
    <div class="grid-4 mb12">
      <div class="card metric">
        <div class="card-title">Balance Futuros</div>
        <div class="metric-value text-primary">${data.balanceFuturos}</div>
        <div class="metric-label">USDT disponible</div>
        <div class="metric-change ${data.modoFuturos === 'REAL' ? 'change-up' : 'change-neutral'} badge">${data.modoFuturos}</div>
      </div>
      <div class="card metric">
        <div class="card-title">Balance Spot</div>
        <div class="metric-value text-blue">${data.balanceSpotUsdt}</div>
        <div class="metric-label">USDT + ${data.balanceSpotEth} ETH</div>
        <div class="metric-change ${data.modoSpot === 'REAL' ? 'change-up' : 'change-neutral'} badge">${data.modoSpot}</div>
      </div>
      <div class="card metric">
        <div class="card-title">Trades Rango</div>
        <div class="metric-value">${data.totalTradesToday}</div>
        <div class="metric-label">Futuros + Spot</div>
      </div>
      <div class="card metric">
        <div class="card-title">Win Rate Global</div>
        <div class="metric-value ${parseFloat(data.winRateGlobal) >= 50 ? 'text-green' : 'text-red'}">${data.winRateGlobal}%</div>
        <div class="wr-bar-wrap"><div class="wr-bar" style="width:${data.winRateGlobal}%"></div></div>
      </div>
    </div>

    <!-- Posiciones abiertas -->
    <div class="section-label">Posiciones Abiertas</div>
    <div class="grid-2 mb12">
      <div class="card">
        <div class="card-title">Futuros BTC-USDT</div>
        ${data.posicionFuturos ? `
        <div class="pos-box">
          <div class="pos-row"><span class="pos-label">Dirección</span><span class="badge badge-${data.posicionFuturos.tipo.toLowerCase()}">${data.posicionFuturos.tipo}</span></div>
          <div class="pos-row"><span class="pos-label">Entrada</span><span class="pos-val">${data.posicionFuturos.entrada} USDT</span></div>
          <div class="pos-row"><span class="pos-label">Stop Loss</span><span class="pos-val text-red">${data.posicionFuturos.sl}</span></div>
          <div class="pos-row"><span class="pos-label">Take Profit</span><span class="pos-val text-green">${data.posicionFuturos.tp}</span></div>
          <div class="pos-row"><span class="pos-label">Cantidad</span><span class="pos-val">${data.posicionFuturos.qty} BTC</span></div>
        </div>` : `<div class="no-data">⏸ Sin posición abierta</div>`}
      </div>
      <div class="card">
        <div class="card-title">Spot ETH-USDT</div>
        ${parseFloat(data.balanceSpotEth) > 0.0001 ? `
        <div class="pos-box">
          <div class="pos-row"><span class="pos-label">ETH en cartera</span><span class="pos-val text-green">${data.balanceSpotEth} ETH</span></div>
          <div class="pos-row"><span class="pos-label">Valor aprox</span><span class="pos-val">${data.valorEthUsdt} USDT</span></div>
          <div class="pos-row"><span class="pos-label">Último precio compra</span><span class="pos-val">${data.ultimaCompraEth || 'N/A'} USDT</span></div>
          <div class="pos-row"><span class="pos-label">USDT disponible</span><span class="pos-val">${data.balanceSpotUsdt}</span></div>
        </div>` : `<div class="no-data">⏸ Sin ETH en cartera</div>`}
      </div>
    </div>

    <!-- Últimas decisiones IA -->
    <div class="section-label">Última Decisión IA</div>
    <div class="grid-2 mb12">
      <div class="card">
        <div class="card-title">Bot Futuros</div>
        ${data.ultimaDecisionFuturos ? `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span class="badge badge-${data.ultimaDecisionFuturos.accion.toLowerCase()}">${data.ultimaDecisionFuturos.accion}</span>
          <span style="font-size:0.82rem">Confianza: <b>${(data.ultimaDecisionFuturos.confianza*100).toFixed(0)}%</b></span>
          <span style="font-size:0.78rem;margin-left:auto;color:${data.ultimaDecisionFuturos.ejecutado?'var(--green)':'var(--red)'}">${data.ultimaDecisionFuturos.ejecutado?'✅ Ejecutado':'⏸ No ejecutado'}</span>
        </div>
        <div class="ai-reason">${data.ultimaDecisionFuturos.razon || 'Sin razón'}</div>` : `<div class="no-data">Sin datos</div>`}
      </div>
      <div class="card">
        <div class="card-title">Bot Spot</div>
        ${data.ultimaDecisionSpot ? `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span class="badge badge-${data.ultimaDecisionSpot.accion.toLowerCase()}">${data.ultimaDecisionSpot.accion}</span>
          <span style="font-size:0.82rem">Confianza: <b>${(data.ultimaDecisionSpot.confianza*100).toFixed(0)}%</b></span>
          <span style="font-size:0.78rem;margin-left:auto;color:${data.ultimaDecisionSpot.ejecutado?'var(--green)':'var(--red)'}">${data.ultimaDecisionSpot.ejecutado?'✅ Ejecutado':'⏸ No ejecutado'}</span>
        </div>
        <div class="ai-reason">${data.ultimaDecisionSpot.razon || 'Sin razón'}</div>` : `<div class="no-data">Sin datos</div>`}
      </div>
    </div>

    <!-- Últimos trades combinados -->
    <div class="section-label">Últimos Trades</div>
    <div class="card mb12">
      ${data.todosLosTradesHoy.length > 0 ? data.todosLosTradesHoy.map(t => `
      <div class="trade-item">
        <div class="trade-left">
          <div class="trade-icon icon-${t.accion.toLowerCase()}">${t.accion === 'BUY' || t.accion === 'LONG' ? '📈' : '📉'}</div>
          <div>
            <div class="trade-par">${t.par} <span class="badge badge-${t.accion.toLowerCase()}" style="margin-left:4px">${t.accion}</span></div>
            <div class="trade-time">${t.bot} · ${t.hora}</div>
          </div>
        </div>
        <div class="trade-right">
          <div class="trade-price">${t.precio} USDT</div>
          <div class="trade-qty">${t.detalle}</div>
        </div>
      </div>`).join('') : `<div class="no-data">Sin trades Rango</div>`}
    </div>

  </div>

  <!-- ══════════════════════════════════════ -->
  <!-- TAB: FUTUROS -->
  <!-- ══════════════════════════════════════ -->
  <div class="section" id="tab-futuros">
    <div class="grid-4 mb12">
      <div class="card metric">
        <div class="card-title">Trades Rango</div>
        <div class="metric-value">${data.statsFuturos.total}</div>
      </div>
      <div class="card metric">
        <div class="card-title">LONG</div>
        <div class="metric-value text-green">${data.statsFuturos.longs}</div>
      </div>
      <div class="card metric">
        <div class="card-title">SHORT</div>
        <div class="metric-value text-red">${data.statsFuturos.shorts}</div>
      </div>
      <div class="card metric">
        <div class="card-title">Win Rate Real</div>
        <div class="metric-value ${parseFloat(data.winRateGlobal) >= 50 ? 'text-green' : 'text-red'}">${data.winRateGlobal}%</div>
        <div class="wr-bar-wrap"><div class="wr-bar" style="width:${data.winRateGlobal}%"></div></div>
      </div>
    </div>

    <div class="section-label">Historial de Trades</div>
    <div class="card mb12">
      ${data.tradesFuturos.length > 0 ? data.tradesFuturos.map(t => `
      <div class="trade-item">
        <div class="trade-left">
          <div class="trade-icon icon-${t.accion.toLowerCase()}">${t.accion === 'LONG' ? '📈' : '📉'}</div>
          <div>
            <div class="trade-par">BTC-USDT <span class="badge badge-${t.accion.toLowerCase()}" style="margin-left:4px">${t.accion}</span></div>
            <div class="trade-time">${t.timestamp_apertura}</div>
          </div>
        </div>
        <div class="trade-right">
          <div class="trade-price">${t.precio_entrada} USDT</div>
          <div class="trade-qty">SL: ${t.stop_loss || 'N/A'} · TP: ${t.take_profit || 'N/A'}</div>
        </div>
      </div>`).join('') : `<div class="no-data">Sin trades registrados</div>`}
    </div>

    <div class="section-label">Estadísticas Futuros</div>
    <div class="card mb12">
      <div class="stat-item"><span class="stat-key">Total trades Rango</span><span class="stat-val">${data.statsFuturos.total}</span></div>
      <div class="stat-item"><span class="stat-key">LONG ejecutados</span><span class="stat-val text-green">${data.statsFuturos.longs}</span></div>
      <div class="stat-item"><span class="stat-key">SHORT ejecutados</span><span class="stat-val text-red">${data.statsFuturos.shorts}</span></div>
      <div class="stat-item"><span class="stat-key">Total (Histórico Cerrados)</span><span class="stat-val">${data.statsFuturos.tradesCerrados}</span></div>\n      <div class="stat-item"><span class="stat-key">Trades ganadores</span><span class="stat-val text-green">${data.statsFuturos.ganados}</span></div>
      <div class="stat-item"><span class="stat-key">Trades perdedores</span><span class="stat-val text-red">${data.statsFuturos.perdidos}</span></div>
      <div class="stat-item" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><span class="stat-key" style="font-weight:600;color:var(--text)">PnL Total Acumulado</span><span class="stat-val ${parseFloat(data.statsFuturos.pnlTotal)>=0?'text-green':'text-red'}" style="font-weight:600;font-size:1.1rem">${data.statsFuturos.pnlTotal} USDT</span></div>\n      <div class="stat-item"><span class="stat-key">Tasa de ejecución (IA vs Ejecutadas)</span><span class="stat-val">${data.statsFuturos.tasaEjecucion}%</span></div>
    </div>
  </div>

  <!-- ══════════════════════════════════════ -->
  <!-- TAB: SPOT -->
  <!-- ══════════════════════════════════════ -->
  <div class="section" id="tab-spot">
    <div class="grid-4 mb12">
      <div class="card metric">
        <div class="card-title">Trades Rango</div>
        <div class="metric-value">${data.statsSpot.total}</div>
      </div>
      <div class="card metric">
        <div class="card-title">Compras</div>
        <div class="metric-value text-green">${data.statsSpot.buys}</div>
      </div>
      <div class="card metric">
        <div class="card-title">Ventas</div>
        <div class="metric-value text-red">${data.statsSpot.sells}</div>
      </div>
      <div class="card metric">
        <div class="card-title">ETH en cartera</div>
        <div class="metric-value text-blue">${data.balanceSpotEth}</div>
      </div>
    </div>

    <div class="section-label">Historial Spot</div>
    <div class="card mb12">
      ${data.tradesSpot.length > 0 ? data.tradesSpot.map(t => `
      <div class="trade-item">
        <div class="trade-left">
          <div class="trade-icon icon-${t.accion.toLowerCase()}">${t.accion === 'BUY' ? '🟢' : '🔴'}</div>
          <div>
            <div class="trade-par">ETH-USDT <span class="badge badge-${t.accion.toLowerCase()}" style="margin-left:4px">${t.accion}</span></div>
            <div class="trade-time">${t.timestamp_apertura}</div>
          </div>
        </div>
        <div class="trade-right">
          <div class="trade-price">${t.precio_entrada} USDT</div>
          <div class="trade-qty">${t.cantidad_eth} ETH · ${t.capital_usdt} USDT</div>
        </div>
      </div>`).join('') : `<div class="no-data">Sin trades registrados</div>`}
    </div>

    <div class="section-label">Estadísticas Spot</div>
    <div class="card mb12">
      <div class="stat-item"><span class="stat-key">Total trades Rango</span><span class="stat-val">${data.statsSpot.total}</span></div>
      <div class="stat-item"><span class="stat-key">Compras (BUY)</span><span class="stat-val text-green">${data.statsSpot.buys}</span></div>
      <div class="stat-item"><span class="stat-key">Ventas (SELL)</span><span class="stat-val text-red">${data.statsSpot.sells}</span></div>
      <div class="stat-item"><span class="stat-key">Decisiones totales Rango</span><span class="stat-val">${data.statsSpot.decisiones}</span></div>
      <div class="stat-item"><span class="stat-key">HOLD / Bloqueados</span><span class="stat-val text-muted">${data.statsSpot.holds}</span></div>
      <div class="stat-item"><span class="stat-key">Tasa de ejecución</span><span class="stat-val">${data.statsSpot.tasaEjecucion}%</span></div>
      <div class="stat-item"><span class="stat-key">Último precio compra ETH</span><span class="stat-val">${data.ultimaCompraEth || 'N/A'} USDT</span></div>
    </div>
  </div>

  <!-- ══════════════════════════════════════ -->
  <!-- TAB: ESTADÍSTICAS -->
  <!-- ══════════════════════════════════════ -->
  <div class="section" id="tab-estadisticas">

    <div class="section-label">Rendimiento Global</div>
    <div class="grid-3 mb12">
      <div class="card metric">
        <div class="card-title">Win Rate Global</div>
        <div class="metric-value ${parseFloat(data.winRateGlobal) >= 50 ? 'text-green' : 'text-red'}">${data.winRateGlobal}%</div>
        <div class="wr-bar-wrap"><div class="wr-bar" style="width:${data.winRateGlobal}%"></div></div>
        <div class="metric-label">${data.totalTrades} trades totales</div>
      </div>
      <div class="card metric">
        <div class="card-title">Total Trades</div>
        <div class="metric-value">${data.totalTrades}</div>
        <div class="metric-label">Desde el inicio</div>
      </div>
      <div class="card metric">
        <div class="card-title">Tasa de Ejecución</div>
        <div class="metric-value text-primary">${data.tasaEjecucionGlobal}%</div>
        <div class="metric-label">Decisiones ejecutadas</div>
      </div>
    </div>

    <div class="section-label">Actividad por Bot</div>
    <div class="grid-2 mb12">
      <div class="card">
        <div class="card-title">Futuros BTC</div>
        <div class="stat-item"><span class="stat-key">Total trades</span><span class="stat-val">${data.statsGlobalFuturos.total}</span></div>
        <div class="stat-item"><span class="stat-key">LONG</span><span class="stat-val text-green">${data.statsGlobalFuturos.longs}</span></div>
        <div class="stat-item"><span class="stat-key">SHORT</span><span class="stat-val text-red">${data.statsGlobalFuturos.shorts}</span></div>
        <div class="stat-item"><span class="stat-key">Días activo</span><span class="stat-val">${data.statsGlobalFuturos.diasActivo}</span></div>
      </div>
      <div class="card">
        <div class="card-title">Spot ETH</div>
        <div class="stat-item"><span class="stat-key">Total trades</span><span class="stat-val">${data.statsGlobalSpot.total}</span></div>
        <div class="stat-item"><span class="stat-key">Compras</span><span class="stat-val text-green">${data.statsGlobalSpot.buys}</span></div>
        <div class="stat-item"><span class="stat-key">Ventas</span><span class="stat-val text-red">${data.statsGlobalSpot.sells}</span></div>
        <div class="stat-item"><span class="stat-key">Días activo</span><span class="stat-val">${data.statsGlobalSpot.diasActivo}</span></div>
      </div>
    </div>

    <div class="section-label">Actividad IA — Rango</div>
    <div class="grid-2 mb12">
      <div class="card">
        <div class="card-title">Decisiones Futuros Rango</div>
        <div class="stat-item"><span class="stat-key">Total decisiones</span><span class="stat-val">${data.statsFuturos.decisiones}</span></div>
        <div class="stat-item"><span class="stat-key">Ejecutadas</span><span class="stat-val text-green">${data.statsFuturos.total}</span></div>
        <div class="stat-item"><span class="stat-key">HOLD / Bloqueadas</span><span class="stat-val text-muted">${data.statsFuturos.holds}</span></div>
        <div class="stat-item"><span class="stat-key">Tasa ejecución</span><span class="stat-val">${data.statsFuturos.tasaEjecucion}%</span></div>
      </div>
      <div class="card">
        <div class="card-title">Decisiones Spot Rango</div>
        <div class="stat-item"><span class="stat-key">Total decisiones</span><span class="stat-val">${data.statsSpot.decisiones}</span></div>
        <div class="stat-item"><span class="stat-key">Ejecutadas</span><span class="stat-val text-green">${data.statsSpot.total}</span></div>
        <div class="stat-item"><span class="stat-key">HOLD / Bloqueadas</span><span class="stat-val text-muted">${data.statsSpot.holds}</span></div>
        <div class="stat-item"><span class="stat-key">Tasa ejecución</span><span class="stat-val">${data.statsSpot.tasaEjecucion}%</span></div>
      </div>
    </div>

    <div class="section-label">Gráficas de Rendimiento</div>
    <div class="card mb12">
      <div class="card-title">Crecimiento de PnL Acumulado (USDT)</div>
      <div class="chart-wrap" style="height: 300px;">
        <canvas id="pnlChart"></canvas>
      </div>
    </div>

    <div class="grid-2 mb12">
      <div class="card">
        <div class="card-title">Distribución de Direcciones</div>
        <div class="chart-wrap" style="height: 250px;">
          <canvas id="accionesChart"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Win vs Loss</div>
        <div class="chart-wrap" style="height: 250px;">
          <canvas id="resultadosChart"></canvas>
        </div>
      </div>
    </div>

  </div>

  <!-- REFRESH -->
  <div class="refresh-row">
    <button class="refresh-btn" onclick="location.reload()">↻ Actualizar ahora</button>
    <span class="auto-text">Auto-refresh en <span id="countdown">60</span>s</span>
  </div>

</div>

<script>
function showTab(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}

// Countdown
let secs = 60;
setInterval(() => {
  secs--;
  const el = document.getElementById('countdown');
  if (el) el.textContent = secs;
  if (secs <= 0) location.reload();
}, 1000);

// --- CHARTS INITIALIZATION ---
// Inject data safely
const chartData = ${JSON.stringify(data.charts)};

if (chartData && chartData.pnl && chartData.pnl.length > 0) {
    new Chart(document.getElementById('pnlChart'), {
        type: 'line',
        data: {
            labels: chartData.pnl.map(d => d.x),
            datasets: [{
                label: 'PnL Acumulado',
                data: chartData.pnl.map(d => d.y),
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#4f46e5'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#e2e8f0' } },
                x: { grid: { display: false } }
            }
        }
    });
}

if (chartData && chartData.acciones) {
    new Chart(document.getElementById('accionesChart'), {
        type: 'doughnut',
        data: {
            labels: chartData.acciones.map(d => d.label),
            datasets: [{
                data: chartData.acciones.map(d => d.value),
                backgroundColor: ['#4f46e5', '#ef4444', '#f59e0b', '#10b981', '#3b82f6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

if (chartData && chartData.resultados) {
    new Chart(document.getElementById('resultadosChart'), {
        type: 'pie',
        data: {
            labels: chartData.resultados.map(d => d.label),
            datasets: [{
                data: chartData.resultados.map(d => d.value),
                backgroundColor: ['#10b981', '#ef4444']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
</script>

</body>
</html>`;

// ═══════════════════════════════════════════
// OBTENER DATOS DESDE MYSQL
// ═══════════════════════════════════════════
async function getDashboardData(period = 'today') {
    let dfFut = 'DATE(timestamp_apertura) = CURDATE()';
    let dfSpot = 'DATE(timestamp_apertura) = CURDATE()';
    let dfDecFut = 'DATE(timestamp) = CURDATE()';
    let dfDecSpot = 'DATE(fecha) = CURDATE()';

    if (period === '7days') {
        dfFut = 'timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        dfSpot = 'timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        dfDecFut = 'timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        dfDecSpot = 'fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (period === '30days') {
        dfFut = 'timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        dfSpot = 'timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        dfDecFut = 'timestamp >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        dfDecSpot = 'fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    } else if (period === 'all') {
        dfFut = '1=1';
        dfSpot = '1=1';
        dfDecFut = '1=1';
        dfDecSpot = '1=1';
    }
    try {
        const fmt = (d) => {
            if (!d) return 'N/A';
            return new Date(d).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
        };

        const traderFuturos = require('./src/trader');
        const traderSpot = require('./src/spot/trader');

        const [balanceFut, balSpot] = await Promise.all([
            traderFuturos.getBalance().catch(() => 0),
            traderSpot.getSpotBalance().catch(() => ({ usdt: 0, eth: 0 }))
        ]);

        let precioEth = 0;
        try {
            const marketSpot = require('./src/spot/market');
            precioEth = await marketSpot.getCurrentPrice('ETH-USDT');
        } catch(e) {}

        // Trades futuros Rango
        const [tradesFuturos] = await db.execute(`
            SELECT par, direccion AS accion, precio_entrada, stop_loss, take_profit, capital_usado AS cantidad, timestamp_apertura
            FROM bot_trades WHERE ${dfFut}
            ORDER BY timestamp_apertura DESC LIMIT 20
        `);

        // Trades spot Rango
        const [tradesSpot] = await db.execute(`
            SELECT par, accion, precio_entrada, capital_usdt, cantidad_eth, timestamp_apertura
            FROM spot_trades WHERE ${dfSpot}
            ORDER BY timestamp_apertura DESC LIMIT 20
        `);

        // Posicion futuros
        const [posicion] = await db.execute(`
            SELECT direccion as tipo, precio_entrada as entrada, stop_loss as sl,
                   take_profit as tp, capital_usado as qty
            FROM bot_trades WHERE ${dfFut}
            AND timestamp_cierre IS NULL
            AND direccion IN ('LONG','SHORT') ORDER BY timestamp_apertura DESC LIMIT 1
        `);

        // Ultima decision futuros
        const [decFuturos] = await db.execute(`
            SELECT accion, confianza, razon, ejecutado FROM bot_decisions
            ORDER BY timestamp DESC LIMIT 1
        `);

        // Ultima decision spot
        const [decSpot] = await db.execute(`
            SELECT accion, confianza, razon, ejecutado FROM spot_decisions
            ORDER BY fecha DESC LIMIT 1
        `);

        // Ultima compra ETH
        const [ultimaCompra] = await db.execute(`
            SELECT precio_entrada FROM spot_trades WHERE accion = 'BUY'
            ORDER BY timestamp_apertura DESC LIMIT 1
        `);

        // Stats futuros Rango
        const [sfHoy] = await db.execute(`
            SELECT COUNT(*) as total,
                   SUM(direccion='LONG') as longs,
                   SUM(direccion='SHORT') as shorts
            FROM bot_trades WHERE ${dfFut}
        `);

        // Decisiones futuros Rango
        const [dfHoy] = await db.execute(`
            SELECT COUNT(*) as total, SUM(ejecutado=1) as ejecutadas
            FROM bot_decisions WHERE ${dfDecFut}
        `);

        // Stats spot Rango
        const [ssHoy] = await db.execute(`
            SELECT COUNT(*) as total,
                   SUM(accion='BUY') as buys,
                   SUM(accion='SELL') as sells
            FROM spot_trades WHERE ${dfSpot}
        `);

        // Decisiones spot Rango
        const [dsHoy] = await db.execute(`
            SELECT COUNT(*) as total, SUM(ejecutado=1) as ejecutadas
            FROM spot_decisions WHERE ${dfDecSpot}
        `);

        // Stats globales futuros
        const [sgFut] = await db.execute(`
            SELECT COUNT(*) as total,
                   SUM(direccion='LONG') as longs,
                   SUM(direccion='SHORT') as shorts,
                   COUNT(DISTINCT DATE(timestamp_apertura)) as diasActivo
            FROM bot_trades
        `);

        // Stats globales spot
        const [sgSpot] = await db.execute(`
            SELECT COUNT(*) as total,
                   SUM(accion='BUY') as buys,
                   SUM(accion='SELL') as sells,
                   COUNT(DISTINCT DATE(timestamp_apertura)) as diasActivo
            FROM spot_trades
        `);

        // WIN RATE REAL - PROBLEMA 5
        const [winData] = await db.execute(`
            SELECT
                COUNT(*) as total,
                SUM(resultado = 'WIN') as ganados,
                SUM(resultado = 'LOSS') as perdidos,
                SUM(ganancia_perdida) as pnl_total
            FROM bot_trades
            WHERE timestamp_cierre IS NOT NULL
        `);

        const winRateReal = winData[0].total > 0
            ? ((winData[0].ganados / winData[0].total) * 100).toFixed(0)
            : 0;

        // --- DATOS PARA GRAFICAS ---
        const [pnlHist] = await db.execute(`
            SELECT DATE_FORMAT(timestamp_cierre, '%Y-%m-%d') as fecha, SUM(ganancia_perdida) as pnl
            FROM bot_trades WHERE timestamp_cierre IS NOT NULL
            GROUP BY fecha ORDER BY fecha ASC
        `);

        let pnlAcumulado = 0;
        const chartDataPnl = pnlHist.map(h => {
            pnlAcumulado += parseFloat(h.pnl || 0);
            return { x: h.fecha, y: parseFloat(pnlAcumulado.toFixed(2)) };
        });

        const [distribucionAcciones] = await db.execute(`
            SELECT direccion as label, COUNT(*) as value FROM bot_trades GROUP BY direccion
        `);

        const [distribucionResultados] = await db.execute(`
            SELECT resultado as label, COUNT(*) as value FROM bot_trades WHERE timestamp_cierre IS NOT NULL GROUP BY resultado
        `);

        // Formatear trades
        tradesFuturos.forEach(t => t.timestamp_apertura = fmt(t.timestamp_apertura));
        tradesSpot.forEach(t => {
            t.timestamp_apertura = fmt(t.timestamp_apertura);
            t.capital_usdt = parseFloat(t.capital_usdt || 0).toFixed(2);
            t.cantidad_eth = parseFloat(t.cantidad_eth || 0).toFixed(5);
            t.precio_entrada = parseFloat(t.precio_entrada || 0).toFixed(2);
        });

        // Combinar trades del día
        const todosHoy = [
            ...tradesFuturos.slice(0, 5).map(t => ({
                par: 'BTC-USDT', accion: t.accion,
                precio: t.precio_entrada, hora: t.timestamp_apertura,
                detalle: `${t.cantidad || '?'} BTC`, bot: 'Futuros'
            })),
            ...tradesSpot.slice(0, 5).map(t => ({
                par: 'ETH-USDT', accion: t.accion,
                precio: t.precio_entrada, hora: t.timestamp_apertura,
                detalle: `${t.cantidad_eth} ETH`, bot: 'Spot'
            }))
        ].sort((a, b) => b.hora.localeCompare(a.hora)).slice(0, 8);

        // Stats adicionales para dashboard
        const totalTrades = (parseInt(sgFut[0].total) || 0) + (parseInt(sgSpot[0].total) || 0);

        const sfTotal = parseInt(sfHoy[0].total) || 0;
        const dfTotal = parseInt(dfHoy[0]?.total) || 0;
        const dfEjec = parseInt(dfHoy[0]?.ejecutadas) || 0;

        const ssTotal = parseInt(ssHoy[0].total) || 0;
        const dsTotal = parseInt(dsHoy[0]?.total) || 0;
        const dsEjec = parseInt(dsHoy[0]?.ejecutadas) || 0;

        return {
            timestamp: new Date().toLocaleTimeString('es-SV'),
            balanceFuturos: balanceFut ? balanceFut.toFixed(2) : '0.00',
            balanceSpotUsdt: balSpot ? balSpot.usdt.toFixed(2) : '0.00',
            balanceSpotEth: balSpot ? balSpot.eth.toFixed(6) : '0.000000',
            valorEthUsdt: (balSpot && precioEth) ? (balSpot.eth * precioEth).toFixed(2) : '0.00',
            modoFuturos: process.env.MODO_REAL === 'true' ? 'REAL' : 'SIMULADO',
            modoSpot: process.env.MODO_REAL_SPOT === 'true' ? 'REAL' : 'SIMULADO',
            posicionFuturos: posicion[0] || null,
            tradesFuturos,
            tradesSpot,
            todosLosTradesHoy: todosHoy,
            ultimaDecisionFuturos: decFuturos[0] || null,
            ultimaDecisionSpot: decSpot[0] || null,
            ultimaCompraEth: ultimaCompra[0] ? parseFloat(ultimaCompra[0].precio_entrada).toFixed(2) : null,
            totalTradesToday: sfTotal + ssTotal,
            totalTrades,
            winRateGlobal: winRateReal, // Reemplazado por el calculo real de bd
            tasaEjecucionGlobal: dfTotal > 0 ? ((dfEjec / dfTotal) * 100).toFixed(0) : 0,
            statsFuturos: {
                total: sfTotal,
                longs: parseInt(sfHoy[0].longs) || 0,
                shorts: parseInt(sfHoy[0].shorts) || 0,
                decisiones: dfTotal,
                holds: dfTotal - dfEjec,
                winRate: dfTotal > 0 ? ((dfEjec / dfTotal) * 100).toFixed(0) : 0,
                tasaEjecucion: dfTotal > 0 ? ((dfEjec / dfTotal) * 100).toFixed(0) : 0,
                tradesCerrados: winData[0].total || 0,
                ganados: winData[0].ganados || 0,
                perdidos: winData[0].perdidos || 0,
                pnlTotal: parseFloat(winData[0].pnl_total || 0).toFixed(2)
            },
            statsSpot: {
                total: ssTotal,
                buys: parseInt(ssHoy[0].buys) || 0,
                sells: parseInt(ssHoy[0].sells) || 0,
                decisiones: dsTotal,
                holds: dsTotal - dsEjec,
                tasaEjecucion: dsTotal > 0 ? ((dsEjec / dsTotal) * 100).toFixed(0) : 0
            },
            statsGlobalFuturos: {
                total: parseInt(sgFut[0].total) || 0,
                longs: parseInt(sgFut[0].longs) || 0,
                shorts: parseInt(sgFut[0].shorts) || 0,
                diasActivo: parseInt(sgFut[0].diasActivo) || 0
            },
            statsGlobalSpot: {
                total: parseInt(sgSpot[0].total) || 0,
                buys: parseInt(sgSpot[0].buys) || 0,
                sells: parseInt(sgSpot[0].sells) || 0,
                diasActivo: parseInt(sgSpot[0].diasActivo) || 0
            },
            charts: {
                pnl: chartDataPnl,
                acciones: distribucionAcciones,
                resultados: distribucionResultados
            }
        };
    } catch (error) {
        console.error('Error dashboard data:', error);
        return {
            timestamp: new Date().toLocaleTimeString('es-SV'),
            balanceFuturos: 'Error', balanceSpotUsdt: 'Error',
            balanceSpotEth: '0', valorEthUsdt: '0',
            modoFuturos: '?', modoSpot: '?',
            posicionFuturos: null, tradesFuturos: [], tradesSpot: [],
            todosLosTradesHoy: [], ultimaDecisionFuturos: null,
            ultimaDecisionSpot: null, ultimaCompraEth: null,
            totalTradesToday: 0, totalTrades: 0, winRateGlobal: 0,
            tasaEjecucionGlobal: 0,
            statsFuturos: { total:0, longs:0, shorts:0, decisiones:0, holds:0, winRate:0, tasaEjecucion:0, tradesCerrados:0, ganados:0, perdidos:0, pnlTotal:0 },
            statsSpot: { total:0, buys:0, sells:0, decisiones:0, holds:0, tasaEjecucion:0 },
            statsGlobalFuturos: { total:0, longs:0, shorts:0, diasActivo:0 },
            statsGlobalSpot: { total:0, buys:0, sells:0, diasActivo:0 }
        };
    }
}
// ═══════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════
app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/');
    res.send(loginHTML());
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === DASH_USER && password === DASH_PASS) {
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.send(loginHTML('Usuario o contraseña incorrectos'));
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const data = await getDashboardData(period);
    res.send(dashboardHTML(data, period));
});

app.get('/api/data', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const data = await getDashboardData(period);
    res.json(data);
});

app.listen(PORT, () => {
    console.log(`Dashboard corriendo en http://localhost:${PORT}`);
});
