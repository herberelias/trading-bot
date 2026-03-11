require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'trading-bot-super-ultra-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

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
<meta charset="UTF-8"><title>Login - Antigravity</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: #020617; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: white; }
  .card { background: #0f172a; padding: 45px; border-radius: 32px; width: 100%; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #1e293b; text-align: center; }
  input { width: 100%; padding: 14px; margin: 12px 0; border-radius: 12px; border: 1px solid #334155; background: #020617; color: white; outline: none; box-sizing: border-box; }
  button { width: 100%; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #4f46e5, #9333ea); color: white; font-weight: 800; cursor: pointer; margin-top: 15px; transition: transform 0.2s; }
  button:hover { transform: translateY(-2px); }
  .error { background: rgba(239, 68, 68, 0.1); color: #f87171; padding: 10px; border-radius: 8px; font-size: 0.8rem; margin-top: 15px; }
</style>
</head>
<body>
<div class="card">
  <div style="font-size: 3rem; margin-bottom: 20px;">🛡️</div>
  <h1 style="margin:0; font-weight:800; letter-spacing:-1px;">ANTIGRAVITY</h1>
  <p style="color:#64748b; margin-top:5px; margin-bottom:40px;">Sistema de Trading Multicuenta</p>
  <form method="POST" action="/login">
    <input type="text" name="username" placeholder="Usuario" required>
    <input type="password" name="password" placeholder="Contraseña" required>
    ${error ? `<div class="error">❌ ${error}</div>` : ''}
    <button type="submit">ACCEDER AL PANEL</button>
  </form>
</div>
</body>
</html>`;

// ═══════════════════════════════════════════
// DASHBOARD HTML (KPIs SEPARADOS)
// ═══════════════════════════════════════════
const dashboardHTML = (data, period) => `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Trading Dashboard — ${data.userName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg: #020617; --card: #0f172a; --card2: #1e293b; --border: #334155;
            --text: #f8fafc; --text2: #94a3b8; --primary: #6366f1;
            --green: #10b981; --red: #ef4444; --yellow: #f59e0b; --blue: #3b82f6;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; overflow-x: hidden; }
        
        header { 
            background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px); 
            padding: 15px 40px; border-bottom: 1px solid var(--border); 
            display: flex; justify-content: space-between; align-items: center; 
            position: sticky; top: 0; z-index: 1000;
        }

        .container { max-width: 1600px; margin: 0 auto; padding: 40px; }
        
        /* Layout de KPIs Grid */
        .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .kpi-card { background: var(--card); border: 1px solid var(--border); padding: 20px; border-radius: 20px; transition: transform 0.3s; }
        .kpi-card:hover { transform: translateY(-5px); border-color: var(--primary); }
        .kpi-label { color: var(--text2); font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .kpi-value { font-size: 1.5rem; font-weight: 800; display: flex; align-items: baseline; gap: 5px; }
        .kpi-sub { font-size: 0.75rem; color: var(--text2); font-weight: 500; }

        .section-header { display: flex; align-items: center; gap: 15px; margin: 40px 0 20px; border-left: 4px solid var(--primary); padding-left: 15px; }
        .section-header h2 { font-size: 1.1rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }

        .main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }
        
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 25px; height: 100%; }
        
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 15px; color: var(--text2); font-size: 0.7rem; text-transform: uppercase; border-bottom: 1px solid var(--border); }
        td { padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.85rem; }
        
        .badge { padding: 5px 12px; border-radius: 10px; font-weight: 800; font-size: 0.65rem; text-transform: uppercase; }
        .bg-green { background: rgba(16, 185, 129, 0.1); color: var(--green); }
        .bg-red { background: rgba(239, 68, 68, 0.1); color: var(--red); }
        .bg-blue { background: rgba(59, 130, 246, 0.1); color: var(--blue); }

        .ai-box { background: var(--card2); border: 1px solid var(--border); border-radius: 20px; padding: 20px; }
        
        .nav-link { 
            padding: 8px 16px; border-radius: 10px; text-decoration: none; color: var(--text2); font-weight: 700; font-size: 0.75rem; transition: 0.3s;
        }
        .nav-link.active { background: var(--primary); color: white; }
        
        select { background: #1e293b; color: white; border: 1px solid var(--border); padding: 8px 15px; border-radius: 12px; font-weight: 700; outline: none; cursor: pointer; }
    </style>
</head>
<body>

<header>
    <div style="display:flex; align-items:center; gap:30px;">
        <div style="font-size:1.6rem; font-weight:900; letter-spacing:-1.5px; color:var(--primary);">ANTIGRAVITY <span style="font-weight:300; color:white;">BETA</span></div>
        <div style="display:flex; background:rgba(0,0,0,0.3); padding:5px; border-radius:12px; gap:5px;">
            <a href="/?period=today" class="nav-link ${period === 'today' ? 'active' : ''}">HOY</a>
            <a href="/?period=7days" class="nav-link ${period === '7days' ? 'active' : ''}">SEMANA</a>
            <a href="/?period=all" class="nav-link ${period === 'all' ? 'active' : ''}">HISTÓRICO</a>
        </div>
        <!-- SELECTOR_USUARIO -->
    </div>
    <div style="display:flex; align-items:center; gap:20px;">
        <div style="text-align:right;">
            <div style="font-weight:800; font-size:0.9rem;">${data.userName}</div>
            <div style="font-size:0.65rem; color:var(--text2); text-transform:uppercase; font-weight:800; letter-spacing:1px;">CUENTA ${data.userRole}</div>
        </div>
        <a href="/logout" style="text-decoration:none; color:var(--red); font-weight:800; border:2px solid var(--red); padding:8px 18px; border-radius:15px; font-size:0.75rem;">CERRAR SESIÓN</a>
    </div>
</header>

<div class="container">
    
    <!-- KPI SECTION: FUTUROS -->
    <div class="section-header"><h2>📊 DASHBOARD FUTUROS (BTC)</h2></div>
    <div class="kpi-row">
        <div class="kpi-card">
            <div class="kpi-label">Balance Disponible</div>
            <div class="kpi-value" style="color:var(--primary)">$${data.futuros.balance} <span class="kpi-sub">USDT</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">PnL Rango</div>
            <div class="kpi-value" style="color:${parseFloat(data.futuros.pnl) >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${parseFloat(data.futuros.pnl) >= 0 ? '+' : ''}${data.futuros.pnl} <span class="kpi-sub">USDT</span>
            </div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Efectividad Operativa</div>
            <div class="kpi-value">${data.futuros.winRate}% <span class="kpi-sub">WIN RATE</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Volumen Operado</div>
            <div class="kpi-value">${data.futuros.totalTrades} <span class="kpi-sub">OPERACIONES</span></div>
        </div>
    </div>

    <!-- KPI SECTION: SPOT -->
    <div class="section-header" style="border-color:var(--blue)"><h2>📈 DASHBOARD SPOT (ETH)</h2></div>
    <div class="kpi-row">
        <div class="kpi-card">
            <div class="kpi-label">Balance USDT</div>
            <div class="kpi-value" style="color:var(--blue)">$${data.spot.balanceUsdt} <span class="kpi-sub">USDT</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Posición en ETH</div>
            <div class="kpi-value">${data.spot.balanceEth} <span class="kpi-sub">ETH</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Inversión Actual</div>
            <div class="kpi-value">$${data.spot.netoUsdt} <span class="kpi-sub">USDT</span></div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Operaciones</div>
            <div class="kpi-value">${data.spot.totalTrades} <span class="kpi-sub">COMPRA/VENTA</span></div>
        </div>
    </div>

    <div class="main-grid">
        <!-- IZQUIERDA: GRAFICA Y TABLA -->
        <div>
            <div class="card" style="margin-bottom:30px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                    <h3 style="font-weight:800; font-size:1rem;">CURVA DE RENDIMIENTO ACUMULADO</h3>
                    <div style="font-size:0.75rem; color:var(--text2);">Últimas 50 operaciones (Futuros)</div>
                </div>
                <div style="height:320px;"><canvas id="yieldChart"></canvas></div>
            </div>

            <div class="card">
                <h3 style="font-weight:800; font-size:1rem; margin-bottom:20px;">HISTORIAL DETALLADO DE OPERACIONES</h3>
                <table>
                    <thead>
                        <tr><th>Módulo</th><th>Tipo</th><th>Entrada</th><th>Tamaño</th><th>Resultado</th><th>Fecha/Hora</th></tr>
                    </thead>
                    <tbody>
                        ${data.trades.length > 0 ? data.trades.map(t => `
                            <tr>
                                <td><span style="color:var(--text2); font-weight:700;">${t.bot}</span></td>
                                <td><span class="badge ${t.accion.includes('LONG') || t.accion.includes('BUY') ? 'bg-green' : 'bg-red'}">${t.accion}</span></td>
                                <td><b>$${t.precio}</b></td>
                                <td>${t.detalle}</td>
                                <td><span style="font-weight:800; color:${t.resultado === 'WIN' ? 'var(--green)' : t.resultado === 'LOSS' ? 'var(--red)' : 'var(--text2)'}">${t.resultado || 'ABIERTO'}</span></td>
                                <td style="color:var(--text2); font-size:0.75rem;">${t.hora}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text2);">No hay datos de operaciones en este periodo.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- DERECHA: IA Y RESUMEN -->
        <div>
            <div class="card" style="margin-bottom:30px;">
                <h3 style="font-weight:800; font-size:1rem; margin-bottom:20px;">🤖 INTELIGENCIA ARTIFICIAL</h3>
                ${data.ai ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <span class="badge ${data.ai.accion === 'LONG' ? 'bg-green' : 'bg-red'}" style="font-size:1.1rem; padding:10px 20px;">${data.ai.accion}</span>
                        <div style="text-align:right">
                            <div style="font-size:0.65rem; color:var(--text2); font-weight:800;">CONFIANZA</div>
                            <div style="font-size:1.2rem; font-weight:900; color:var(--primary);">${Math.round(data.ai.confianza * 100)}%</div>
                        </div>
                    </div>
                    <div class="ai-box" style="font-size:0.85rem; line-height:1.7; color:#cbd5e1;">" ${data.ai.razon} "</div>
                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <div style="flex:1; background:rgba(255,255,255,0.03); border:1px solid var(--border); padding:15px; border-radius:15px; text-align:center;">
                            <div class="kpi-label" style="margin:0;">RSI</div>
                            <div style="font-size:1.2rem; font-weight:800;">${data.ai.rsi}</div>
                        </div>
                        <div style="flex:1; background:rgba(255,255,255,0.03); border:1px solid var(--border); padding:15px; border-radius:15px; text-align:center;">
                            <div class="kpi-label" style="margin:0;">ACTUALIZADO</div>
                            <div style="font-size:0.8rem; font-weight:800; color:var(--yellow);">${data.ai.hace}</div>
                        </div>
                    </div>
                ` : '<div style="color:var(--text2)">Sincronizando con el servidor de IA...</div>'}
            </div>

            <div class="card">
                <h3 style="font-weight:800; font-size:1rem; margin-bottom:20px;">📅 RENDIMIENTO DIARIO</h3>
                <table>
                    <thead><tr><th>Día</th><th>PnL USDT</th><th>Trades</th></tr></thead>
                    <tbody>
                        ${data.daily.map(d => `
                            <tr>
                                <td style="font-weight:600;">${d.fecha}</td>
                                <td style="font-weight:800; color:${parseFloat(d.pnl) >= 0 ? 'var(--green)' : 'var(--red)'}">${parseFloat(d.pnl) >= 0 ? '+' : ''}${d.pnl}</td>
                                <td>${d.total}</td>
                            </tr>
                        `).slice(0, 15).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<script>
    const ctx = document.getElementById('yieldChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ${JSON.stringify(data.chart.labels)},
            datasets: [{
                label: 'PnL Acumulado',
                data: ${JSON.stringify(data.chart.data)},
                borderColor: '#6366f1',
                borderWidth: 4,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#6366f1',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { color: '#64748b', font: { weight: 'bold' } } },
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { weight: 'bold' } } }
            }
        }
    });
</script>
</body>
</html>`;

// ═══════════════════════════════════════════
// LOGICA DE DATOS (KPIs DETALLADOS)
// ═══════════════════════════════════════════
async function getDashboardData(period, userId) {
    const [userRow] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const user = userRow[0];
    if (!user) return null;

    const traderFuturos = require('./src/trader');
    const traderSpot = require('./src/spot/trader');

    // Balances reales (llamada a BingX)
    const [balFut, balSpot] = await Promise.all([
        traderFuturos.getBalance(user).catch(() => 0),
        traderSpot.getSpotBalance(user).catch(() => ({ usdt: 0, eth: 0 }))
    ]);

    // Filtros de tiempo
    let tf = `user_id = ${userId}`;
    if (period === 'today') tf += ` AND DATE(timestamp_apertura) = CURDATE()`;
    else if (period === '7days') tf += ` AND timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;

    const tfCierre = tf.replace('timestamp_apertura', 'timestamp_cierre');
    const tfDec = tf.replace('timestamp_apertura', 'timestamp');

    // 1. STATS FUTUROS
    const [fStats] = await db.execute(`
        SELECT COUNT(*) as total, SUM(resultado='WIN') as win, SUM(ganancia_perdida) as pnl
        FROM bot_trades WHERE timestamp_cierre IS NOT NULL AND ${tfCierre}
    `);

    // 2. STATS SPOT
    const [sStats] = await db.execute(`
        SELECT COUNT(*) as total, 
               SUM(CASE WHEN accion='BUY' THEN capital_usdt ELSE 0 END) as inversion,
               SUM(CASE WHEN accion='SELL' THEN capital_usdt ELSE 0 END) as ventas
        FROM spot_trades WHERE ${tf}
    `);

    // 3. TRADES RECIENTES (Combinados)
    const [fTrades] = await db.execute(`SELECT 'FUTUROS' as bot, direccion as accion, precio_entrada as precio, capital_usado as detalle, resultado, timestamp_apertura as hora FROM bot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 15`);
    const [sTrades] = await db.execute(`SELECT 'SPOT' as bot, accion, precio_entrada as precio, cantidad_eth as detalle, 'FINALIZADO' as resultado, timestamp_apertura as hora FROM spot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 15`);
    
    const allTrades = [...fTrades, ...sTrades].sort((a,b) => b.hora - a.hora).slice(0, 25);
    const fmt = (d) => new Date(d).toLocaleString('es-SV', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
    allTrades.forEach(t => t.hora = fmt(t.hora));

    // 4. IA INSIGHTS
    const [decisions] = await db.execute(`SELECT * FROM bot_decisions WHERE ${tfDec} ORDER BY id DESC LIMIT 1`);
    const lastDec = decisions[0];

    // 5. CHART DATA (PnL Acumulado Futuros)
    const [pnlRows] = await db.execute(`
        SELECT DATE_FORMAT(timestamp_cierre, '%d/%m %H:00') as x, SUM(ganancia_perdida) as y 
        FROM bot_trades 
        WHERE user_id = ? AND timestamp_cierre IS NOT NULL 
        GROUP BY x ORDER BY MIN(timestamp_cierre) ASC LIMIT 50
    `, [userId]);
    let ac = 0;
    const chart = { labels: pnlRows.map(r=>r.x), data: pnlRows.map(r=>(ac+=parseFloat(r.y)).toFixed(2)) };

    // 6. DAILY PERFORMANCE
    const [dailyRows] = await db.execute(`
        SELECT DATE_FORMAT(timestamp_cierre, '%Y-%m-%d') as fecha, SUM(ganancia_perdida) as pnl, COUNT(*) as total
        FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL
        GROUP BY fecha ORDER BY fecha DESC LIMIT 20
    `, [userId]);

    return {
        userName: user.nombre,
        userRole: user.role,
        futuros: {
            balance: parseFloat(balFut).toFixed(2),
            pnl: parseFloat(fStats[0].pnl || 0).toFixed(2),
            winRate: fStats[0].total > 0 ? Math.round((fStats[0].win / fStats[0].total) * 100) : 0,
            totalTrades: fStats[0].total || 0
        },
        spot: {
            balanceUsdt: parseFloat(balSpot.usdt).toFixed(2),
            balanceEth: parseFloat(balSpot.eth).toFixed(5),
            netoUsdt: (parseFloat(sStats[0].inversion || 0) - parseFloat(sStats[0].ventas || 0)).toFixed(2),
            totalTrades: sStats[0].total || 0
        },
        trades: allTrades,
        ai: lastDec ? {
            accion: lastDec.accion,
            razon: lastDec.razon,
            confianza: lastDec.confianza,
            rsi: lastDec.rsi || '--',
            hace: Math.round((Date.now() - new Date(lastDec.timestamp))/60000) + ' min'
        } : null,
        chart,
        daily: dailyRows.map(r=>({ fecha: r.fecha, pnl: parseFloat(r.pnl).toFixed(2), total: r.total }))
    };
}

// ═══════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════
app.get('/login', (req, res) => res.send(loginHTML()));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE nombre = ? AND password = ? AND activo = 1', [username, password]);
        if (rows.length > 0) {
            req.session.loggedIn = true; req.session.userId = rows[0].id; req.session.userRole = rows[0].role;
            res.redirect('/');
        } else { res.send(loginHTML('Usuario o clave incorrectos')); }
    } catch (e) { res.send(loginHTML('Error de base de datos')); }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const userId = (req.session.userRole === 'admin' && req.query.user_id) ? req.query.user_id : req.session.userId;
    
    const data = await getDashboardData(period, userId);
    if (!data) return res.redirect('/logout');

    let html = dashboardHTML(data, period);
    if (req.session.userRole === 'admin') {
        const [users] = await db.execute('SELECT id, nombre FROM users');
        const selector = `
            <select onchange="window.location.href='/?user_id='+this.value">
                ${users.map(u => `<option value="${u.id}" ${userId == u.id ? 'selected' : ''}>${u.nombre}</option>`).join('')}
            </select>`;
        html = html.replace('<!-- SELECTOR_USUARIO -->', selector);
    }
    res.send(html);
});

app.listen(PORT, () => console.log(`DASHBOARD KPI v3.0 on ${PORT}`));
