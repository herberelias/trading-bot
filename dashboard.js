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
    background: white; border-radius: 16px; padding: 40px;
    width: 100%; max-width: 380px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
  .logo { text-align: center; margin-bottom: 28px; }
  .logo-icon {
    width: 52px; height: 52px; background: linear-gradient(135deg, #4f46e5, #7c3aed);
    border-radius: 14px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 24px; margin-bottom: 12px;
  }
  h1 { font-size: 1.3rem; font-weight: 700; color: #111; }
  p { font-size: 0.85rem; color: #6b7280; margin-top: 4px; }
  label { display: block; font-size: 0.82rem; font-weight: 500; color: #374151; margin-bottom: 6px; margin-top: 16px; }
  input {
    width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb;
    border-radius: 8px; font-size: 0.9rem; font-family: 'Inter', sans-serif; outline: none; transition: border-color 0.2s;
  }
  input:focus { border-color: #4f46e5; }
  button {
    width: 100%; padding: 11px; background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: white; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600;
    font-family: 'Inter', sans-serif; cursor: pointer; margin-top: 20px; transition: opacity 0.2s;
  }
  button:hover { opacity: 0.9; }
  .error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 10px 14px; border-radius: 8px; font-size: 0.82rem; margin-top: 14px; }
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
    <input type="text" name="username" placeholder="Tu nombre" required>
    <label>Contraseña</label>
    <input type="password" name="password" placeholder="••••••••" required>
    ${error ? `<div class="error">❌ ${error}</div>` : ''}
    <button type="submit">Ingresar</button>
  </form>
</div>
</body>
</html>`;

// ═══════════════════════════════════════════
// DASHBOARD HTML (TEMPLATE)
// ═══════════════════════════════════════════
const dashboardHTML = (data, period) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard — ${data.userName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0;
    --text: #0f172a; --text2: #64748b; --text3: #94a3b8;
    --primary: #4f46e5; --primary-light: #eef2ff;
    --green: #10b981; --green-light: #ecfdf5;
    --red: #ef4444; --red-light: #fef2f2;
    --yellow: #f59e0b; --yellow-light: #fffbeb;
    --blue: #3b82f6; --blue-light: #eff6ff;
    --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  }
  body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

  header {
    background: white; padding: 12px 24px; display: flex; justify-content: space-between;
    align-items: center; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100;
  }
  .header-left { display: flex; align-items: center; gap: 15px; }
  .header-right { display: flex; align-items: center; gap: 16px; }
  .user-badge { display: flex; flex-direction: column; align-items: flex-end; }
  .user-name { font-weight: 700; color: var(--text); font-size: 0.9rem; }
  .user-role { font-size: 0.7rem; color: var(--text2); text-transform: uppercase; font-weight: 600; }
  
  .nav-tabs { display: flex; gap: 5px; background: #f1f5f9; padding: 4px; border-radius: 10px; }
  .nav-link { 
     padding: 6px 12px; border-radius: 7px; text-decoration: none; color: var(--text2);
     font-size: 0.8rem; font-weight: 500; transition: all 0.2s;
  }
  .nav-link.active { background: white; color: var(--primary); box-shadow: var(--shadow); }

  .main { max-width: 1200px; margin: 0 auto; padding: 20px; }
  
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; box-shadow: var(--shadow); }
  .card-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text3); margin-bottom: 12px; }

  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 15px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
  
  .metric-value { font-size: 1.5rem; font-weight: 800; margin-bottom: 2px; }
  .metric-label { font-size: 0.75rem; color: var(--text2); }

  .badge { padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; }
  .badge-green { background: var(--green-light); color: var(--green); }
  .badge-red { background: var(--red-light); color: var(--red); }
  .badge-blue { background: var(--blue-light); color: var(--blue); }

  .section-label { font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--text3); margin: 25px 0 12px; display: flex; align-items: center; gap: 10px; }
  .section-label::after { content:''; flex:1; height:1px; background: var(--border); }

  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { text-align: left; padding: 10px; color: var(--text2); border-bottom: 1px solid var(--border); }
  td { padding: 10px; border-bottom: 1px solid #f1f5f9; }
  
  .ai-box { background: #f8fafc; border-radius: 10px; padding: 15px; font-size: 0.85rem; line-height: 1.5; color: #475569; }
</style>
</head>
<body>

<header>
  <div class="header-left">
    <div style="width:32px; height:32px; background:var(--primary); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:18px;">📊</div>
    <div class="nav-tabs">
      <a href="/?period=today" class="nav-link ${period === 'today' ? 'active' : ''}">Hoy</a>
      <a href="/?period=7days" class="nav-link ${period === '7days' ? 'active' : ''}">7 Días</a>
      <a href="/?period=all" class="nav-link ${period === 'all' ? 'active' : ''}">Histórico</a>
    </div>
    <!-- SELECTOR_USUARIO -->
  </div>
  <div class="header-right">
    <div class="user-badge">
      <span class="user-name">${data.userName}</span>
      <span class="user-role">${data.userRole}</span>
    </div>
    <a href="/logout" style="font-size:0.8rem; color:var(--red); text-decoration:none; font-weight:600;">Salir</a>
  </div>
</header>

<div class="main">
  <div class="grid-4">
    <div class="card">
      <div class="card-title">Balance Futuros</div>
      <div class="metric-value text-primary">${data.balanceFuturos}</div>
      <div class="metric-label">USDT disponible</div>
    </div>
    <div class="card">
      <div class="card-title">Balance Spot</div>
      <div class="metric-value" style="color:var(--blue)">${data.balanceSpotUsdt}</div>
      <div class="metric-label">USDT (ETH: ${data.balanceSpotEth})</div>
    </div>
    <div class="card">
      <div class="card-title">Resultado Rango</div>
      <div class="metric-value ${parseFloat(data.statsFuturos.pnlTotal) >= 0 ? 'badge-green' : 'badge-red'}" style="display:inline-block; padding: 2px 8px; border-radius:8px;">
        ${data.statsFuturos.pnlTotal} USDT
      </div>
      <div class="metric-label">PnL acumulado</div>
    </div>
    <div class="card">
      <div class="card-title">Win Rate</div>
      <div class="metric-value">${data.winRateGlobal}%</div>
      <div style="height:4px; background:#e2e8f0; border-radius:2px; margin-top:8px;">
        <div style="height:100%; background:var(--green); width:${data.winRateGlobal}%; border-radius:2px;"></div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Última Decisión IA (Futuros)</div>
      ${data.ultimaDecisionFuturos ? `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
          <span class="badge ${data.ultimaDecisionFuturos.accion === 'LONG' ? 'badge-green' : 'badge-red'}">${data.ultimaDecisionFuturos.accion}</span>
          <span style="font-size:0.75rem; color:var(--text3)">${data.ultimaDecisionFuturos.timestamp}</span>
        </div>
        <div class="ai-box">${data.ultimaDecisionFuturos.razon}</div>
      ` : '<div style="color:var(--text3); font-size:0.8rem;">Sin decisiones recientes</div>'}
    </div>
    <div class="card">
      <div class="card-title">Crecimiento PnL</div>
      <div style="height:160px;"><canvas id="pnlChart"></canvas></div>
    </div>
  </div>

  <div class="section-label">Actividad Reciente</div>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Bot</th>
          <th>Acción</th>
          <th>Precio</th>
          <th>Detalle</th>
          <th>Hora</th>
        </tr>
      </thead>
      <tbody>
        ${data.todosLosTradesHoy.length > 0 ? data.todosLosTradesHoy.map(t => `
          <tr>
            <td><span class="badge" style="background:#f1f5f9; color:#475569">${t.bot}</span></td>
            <td><span class="badge ${t.accion.includes('BUY') || t.accion.includes('LONG') ? 'badge-green' : 'badge-red'}">${t.accion}</span></td>
            <td><b>${t.precio}</b></td>
            <td>${t.detalle}</td>
            <td style="color:var(--text2)">${t.hora}</td>
          </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--text3)">No hay actividad registrada</td></tr>'}
      </tbody>
    </table>
  </div>
</div>

<script>
const ctx = document.getElementById('pnlChart').getContext('2d');
new Chart(ctx, {
    type: 'line',
    data: {
        labels: ${JSON.stringify(data.charts.pnl.map(d => d.x))},
        datasets: [{
            label: 'PnL',
            data: ${JSON.stringify(data.charts.pnl.map(d => d.y))},
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0
        }]
    },
    options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { display: false }, x: { grid: { display: false } } }
    }
});
</script>
</body>
</html>`;

// ═══════════════════════════════════════════
// OBTENER DATOS DESDE MYSQL (Filtrado por usuario)
// ═══════════════════════════════════════════
async function getDashboardData(period = 'today', userId = 1) {
    let dfFut = `user_id = ${userId} AND DATE(timestamp_apertura) = CURDATE()`;
    let dfSpot = `user_id = ${userId} AND DATE(timestamp_apertura) = CURDATE()`;
    let dfDecFut = `user_id = ${userId} AND DATE(timestamp) = CURDATE()`;
    let dfCierre = `user_id = ${userId} AND DATE(timestamp_cierre) = CURDATE()`;

    if (period === '7days') {
        dfFut = `user_id = ${userId} AND timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
        dfSpot = `user_id = ${userId} AND timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
        dfDecFut = `user_id = ${userId} AND timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
        dfCierre = `user_id = ${userId} AND timestamp_cierre >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    } else if (period === 'all') {
        dfFut = `user_id = ${userId}`;
        dfSpot = `user_id = ${userId}`;
        dfDecFut = `user_id = ${userId}`;
        dfCierre = `user_id = ${userId}`;
    }

    try {
        const [userRow] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const userData = userRow[0] || {};

        const fmt = (d) => d ? new Date(d).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const traderFuturos = require('./src/trader');
        const traderSpot = require('./src/spot/trader');

        const [balanceFut, balSpot] = await Promise.all([
            traderFuturos.getBalance(userData).catch(() => 0),
            traderSpot.getSpotBalance(userData).catch(() => ({ usdt: 0, eth: 0 }))
        ]);

        // Últimos trades
        const [tradesFuturos] = await db.execute(`SELECT * FROM bot_trades WHERE ${dfFut} ORDER BY timestamp_apertura DESC LIMIT 10`);
        const [tradesSpot] = await db.execute(`SELECT * FROM spot_trades WHERE ${dfSpot} ORDER BY timestamp_apertura DESC LIMIT 10`);
        
        // Decisiones
        const [decisionesFut] = await db.execute(`SELECT * FROM bot_decisions WHERE ${dfDecFut} ORDER BY timestamp DESC LIMIT 1`);
        
        // Stats Financieros
        const [winData] = await db.execute(`SELECT COUNT(*) as total, SUM(resultado = 'WIN') as ganados, SUM(ganancia_perdida) as pnl_total FROM bot_trades WHERE timestamp_cierre IS NOT NULL AND ${dfCierre}`);

        // PnL Chart (30 días)
        const [pnlRows] = await db.execute(`SELECT DATE_FORMAT(timestamp_cierre, '%d/%m') as x, SUM(ganancia_perdida) as y FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL GROUP BY x ORDER BY timestamp_cierre ASC`, [userId]);
        let ac = 0;
        const chartPnl = pnlRows.map(r => ({ x: r.x, y: (ac += parseFloat(r.y)).toFixed(2) }));

        const todosHoy = [
            ...tradesFuturos.map(t => ({ bot: 'Futuros', accion: t.direccion, precio: t.precio_entrada, detalle: `${t.capital_usado} USDT`, hora: fmt(t.timestamp_apertura) })),
            ...tradesSpot.map(t => ({ bot: 'Spot', accion: t.accion, precio: t.precio_entrada, detalle: `${t.cantidad_eth} ETH`, hora: fmt(t.timestamp_apertura) }))
        ].sort((a,b) => b.hora.localeCompare(a.hora)).slice(0, 10);

        return {
            userName: userData.nombre || 'Usuario',
            userRole: userData.role || 'user',
            balanceFuturos: parseFloat(balanceFut).toFixed(2),
            balanceSpotUsdt: parseFloat(balSpot.usdt).toFixed(2),
            balanceSpotEth: parseFloat(balSpot.eth).toFixed(4),
            ultimaDecisionFuturos: decisionesFut[0] ? { ...decisionesFut[0], timestamp: fmt(decisionesFut[0].timestamp) } : null,
            winRateGlobal: winData[0].total > 0 ? ((winData[0].ganados / winData[0].total) * 100).toFixed(0) : 0,
            statsFuturos: { pnlTotal: parseFloat(winData[0].pnl_total || 0).toFixed(2) },
            todosLosTradesHoy: todosHoy,
            charts: { pnl: chartPnl }
        };
    } catch (e) {
        console.error(e);
        return { userName: 'Error', userRole: 'Error', balanceFuturos: '0', balanceSpotUsdt: '0', balanceSpotEth: '0', ultimaDecisionFuturos: null, winRateGlobal: 0, statsFuturos: { pnlTotal: 0 }, todosLosTradesHoy: [], charts: { pnl: [] } };
    }
}

// ═══════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════
app.get('/login', (req, res) => res.send(loginHTML()));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const [rows] = await db.execute('SELECT * FROM users WHERE nombre = ? AND password = ? AND activo = 1', [username, password]);
    if (rows.length > 0) {
        req.session.loggedIn = true; req.session.userId = rows[0].id;
        res.redirect('/');
    } else {
        res.send(loginHTML('Credenciales inválidas'));
    }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const userId = (req.session.userId === 1 && req.query.user_id) ? req.query.user_id : req.session.userId;
    const data = await getDashboardData(period, userId);
    
    let html = dashboardHTML(data, period);
    if (req.session.userId === 1) { // Si es admin
        const [users] = await db.execute('SELECT id, nombre FROM users');
        const selector = `
            <select onchange="window.location.href='/?user_id='+this.value" style="margin-left:15px; padding:4px; border-radius:6px; font-size:0.75rem;">
                ${users.map(u => `<option value="${u.id}" ${userId == u.id ? 'selected' : ''}>${u.nombre}</option>`).join('')}
            </select>`;
        html = html.replace('<!-- SELECTOR_USUARIO -->', selector);
    }
    res.send(html);
});

app.listen(PORT, () => console.log(`Dashboard en puerto ${PORT}`));
