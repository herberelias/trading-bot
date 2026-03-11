require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'wintrade-secret-key-2026',
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
<meta charset="UTF-8"><title>Login - WINTRADE</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: #020617; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: white; }
  .card { background: #0f172a; padding: 45px; border-radius: 32px; width: 100%; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #334155; text-align: center; }
  input { width: 100%; padding: 14px; margin: 12px 0; border-radius: 12px; border: 1px solid #334155; background: #020617; color: white; outline: none; box-sizing: border-box; }
  button { width: 100%; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #0ea5e9, #6366f1); color: white; font-weight: 800; cursor: pointer; margin-top: 15px; }
  .error { background: rgba(239, 68, 68, 0.1); color: #f87171; padding: 10px; border-radius: 8px; font-size: 0.8rem; margin-top: 15px; }
</style>
</head>
<body>
<div class="card">
  <div style="font-size: 3rem; margin-bottom: 20px;">🚀</div>
  <h1 style="margin:0; font-weight:800; letter-spacing:-1px;">WINTRADE</h1>
  <p style="color:#64748b; margin-top:5px; margin-bottom:40px;">Professional Trading Suite</p>
  <form method="POST" action="/login">
    <input type="text" name="username" placeholder="Usuario" required>
    <input type="password" name="password" placeholder="Contraseña" required>
    ${error ? `<div class="error">❌ ${error}</div>` : ''}
    <button type="submit">INICIAR SESIÓN</button>
  </form>
</div>
</body>
</html>`;

// ═══════════════════════════════════════════
// DASHBOARD HTML (RESPONSIVE & ORDERED)
// ═══════════════════════════════════════════
const dashboardHTML = (data, period) => `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WINTRADE — ${data.userName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg: #020617; --card: #0f172a; --card-header: #1e293b; --border: #334155;
            --text: #f8fafc; --text-dim: #94a3b8; --primary: #0ea5e9; --secondary: #6366f1;
            --success: #10b981; --danger: #ef4444; --warning: #f59e0b;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
        
        header { 
            background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); 
            padding: 1rem 2rem; border-bottom: 1px solid var(--border); 
            display: flex; justify-content: space-between; align-items: center; 
            position: sticky; top: 0; z-index: 1000;
        }
        .logo { font-size: 1.5rem; font-weight: 800; letter-spacing: -1px; color: var(--primary); display: flex; align-items: center; gap: 8px; }
        .logo span { color: white; font-weight: 300; }

        .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
        
        /* Period Tabs */
        .tabs { display: flex; background: #000; padding: 4px; border-radius: 12px; gap: 4px; margin-right: 20px; }
        .tab-link { padding: 6px 16px; border-radius: 8px; text-decoration: none; color: var(--text-dim); font-size: 0.8rem; font-weight: 700; }
        .tab-link.active { background: var(--card-header); color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }

        /* KPI Grid */
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .kpi-card { background: var(--card); border: 1px solid var(--border); padding: 1.5rem; border-radius: 20px; position: relative; overflow: hidden; }
        .kpi-card::after { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--primary); opacity: 0.5; }
        .kpi-label { font-size: 0.7rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .kpi-value { font-size: 1.75rem; font-weight: 800; margin-bottom: 5px; }
        .kpi-footer { font-size: 0.8rem; font-weight: 600; }

        /* Sections */
        .grid-main { display: grid; grid-template-columns: 1.5fr 1fr; gap: 2rem; }
        @media (max-width: 1024px) { .grid-main { grid-template-columns: 1fr; } }

        .card { background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 1.5rem; height: 100%; }
        .card-title { font-size: 1rem; font-weight: 800; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 10px; }
        
        /* Table Styling */
        .table-container { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 600px; }
        th { text-align: left; padding: 1rem; color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid var(--border); }
        td { padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.85rem; vertical-align: middle; }
        
        .badge { padding: 4px 10px; border-radius: 8px; font-weight: 800; font-size: 0.7rem; text-transform: uppercase; }
        .badge-long { background: rgba(16, 185, 129, 0.1); color: var(--success); }
        .badge-short { background: rgba(239, 68, 68, 0.1); color: var(--danger); }
        .badge-buy { background: rgba(14, 165, 233, 0.1); color: var(--primary); }
        .badge-sell { background: rgba(139, 92, 246, 0.1); color: #a78bfa; }

        .ai-box { background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 20px; padding: 1.5rem; }
        
        select { background: var(--card-header); color: white; border: 1px solid var(--border); padding: 8px 16px; border-radius: 12px; font-weight: 700; outline: none; transition: 0.2s; }
        select:hover { border-color: var(--primary); }

        .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    </style>
</head>
<body>

<header>
    <div style="display:flex; align-items:center; gap:30px;">
        <div class="logo">WINTRADE <span>SUITE</span></div>
        <div class="tabs">
            <a href="/?period=today" class="tab-link ${period === 'today' ? 'active' : ''}">HOY</a>
            <a href="/?period=7days" class="tab-link ${period === '7days' ? 'active' : ''}">7 DÍAS</a>
            <a href="/?period=all" class="tab-link ${period === 'all' ? 'active' : ''}">HISTÓRICO</a>
        </div>
        <!-- SELECTOR_USUARIO -->
    </div>
    <div style="display:flex; align-items:center; gap:20px;">
        <div style="text-align:right;">
            <div style="font-weight:800; font-size:0.9rem;">${data.userName}</div>
            <div style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:800;">ID: ${data.userId} — ${data.userRole}</div>
        </div>
        <a href="/logout" style="text-decoration:none; color:var(--danger); font-weight:800; border:1px solid var(--danger); padding:8px 16px; border-radius:12px; font-size:0.75rem;">SALIR</a>
    </div>
</header>

<div class="container">
    
    <!-- TOP KPIs: GLOBAL TOTALS -->
    <div style="margin-bottom: 2.5rem;">
        <h2 style="font-size: 0.7rem; font-weight: 900; color: var(--text-dim); text-transform: uppercase; margin-bottom: 15px; letter-spacing: 2px;">• RESUMEN GLOBAL DE CUENTA</h2>
        <div class="kpi-grid">
            <div class="kpi-card" style="border-left: 4px solid var(--primary);">
                <div class="kpi-label">Balance Total Estimado</div>
                <div class="kpi-value text-primary">$${data.global.totalBalance}</div>
                <div class="kpi-footer" style="color: var(--text-dim)">Futuros: $${data.futuros.balance} + Spot: $${data.spot.totalValue}</div>
            </div>
            <div class="kpi-card" style="border-left: 4px solid var(--success);">
                <div class="kpi-label">Ganancia/Pérdida Total</div>
                <div class="kpi-value" style="color:${parseFloat(data.global.totalPnL) >= 0 ? 'var(--success)' : 'var(--danger)'}">
                    ${parseFloat(data.global.totalPnL) >= 0 ? '+' : ''}$${data.global.totalPnL}
                </div>
                <div class="kpi-footer">Neto en el periodo seleccionado</div>
            </div>
            <div class="kpi-card" style="border-left: 4px solid var(--warning);">
                <div class="kpi-label">Operaciones Realizadas</div>
                <div class="kpi-value">${data.global.totalTrades}</div>
                <div class="kpi-footer">${data.futuros.totalTrades} Futuros | ${data.spot.totalTrades} Spot</div>
            </div>
            <div class="kpi-card" style="border-left: 4px solid var(--secondary);">
                <div class="kpi-label">Ratio de Éxito Global</div>
                <div class="kpi-value">${data.global.successRate}%</div>
                <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; margin-top:10px;">
                    <div style="height:100%; background:var(--success); width:${data.global.successRate}%; border-radius:2px;"></div>
                </div>
            </div>
        </div>
    </div>

    <div class="grid-main">
        <!-- LEFT COLUMN: CHART & HISTORY -->
        <div>
            <div class="card" style="margin-bottom:2rem;">
                <div class="card-title">📈 CURVA DE CRECIMIENTO (PnL ACUMULADO)</div>
                <div style="height:350px;"><canvas id="yieldChart"></canvas></div>
            </div>

            <div class="card">
                <div class="card-title">🕒 HISTORIAL DETALLADO DE OPERACIONES</div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Módulo</th>
                                <th>Operación</th>
                                <th>Precio Entrada</th>
                                <th>Volumen / Cantidad</th>
                                <th>PnL / Result</th>
                                <th>Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.trades.length > 0 ? data.trades.map(t => `
                                <tr>
                                    <td><span style="color:var(--text-dim); font-weight:700;">${t.bot}</span></td>
                                    <td><span class="badge ${t.badgeClass}">${t.accion}</span></td>
                                    <td><b>$${t.precio}</b></td>
                                    <td>${t.detalle}</td>
                                    <td>
                                        <span style="font-weight:800; color:${parseFloat(t.pnl) > 0 ? 'var(--success)' : parseFloat(t.pnl) < 0 ? 'var(--danger)' : 'var(--text-dim)'}">
                                            ${t.pnl !== '--' ? (parseFloat(t.pnl) >= 0 ? '+' : '') + t.pnl + ' USDT' : t.resultado}
                                        </span>
                                    </td>
                                    <td style="color:var(--text-dim); font-size:0.75rem;">${t.hora}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-dim);">No se encontraron operaciones recientes.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- RIGHT COLUMN: AI & SUMMARY TABLES -->
        <div>
            <div class="card" style="margin-bottom:2rem; border: 1px solid rgba(99, 102, 241, 0.3);">
                <div class="card-title">🤖 ANÁLISIS ESTRATÉGICO I.A.</div>
                ${data.ai ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <span class="badge ${data.ai.accion === 'LONG' || data.ai.accion === 'BUY' ? 'badge-long' : 'badge-short'}" style="font-size:1.2rem; padding:10px 24px; border-radius:15px;">${data.ai.accion}</span>
                        <div style="text-align:right">
                            <div style="font-size:0.65rem; color:var(--text-dim); font-weight:800;">NIVEL DE CONFIANZA</div>
                            <div style="font-size:1.5rem; font-weight:900; color:var(--secondary);">${Math.round(data.ai.confianza * 100)}%</div>
                        </div>
                    </div>
                    <div class="ai-box" style="font-style: italic; color:#e2e8f0; line-height: 1.8;">" ${data.ai.razon} "</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:20px;">
                        <div style="background:var(--card-header); padding:15px; border-radius:16px; text-align:center;">
                            <div class="kpi-label" style="margin:0;">Nivel RSI</div>
                            <div style="font-size:1.25rem; font-weight:800;">${data.ai.rsi}</div>
                        </div>
                        <div style="background:var(--card-header); padding:15px; border-radius:16px; text-align:center;">
                            <div class="kpi-label" style="margin:0;">Última Señal</div>
                            <div style="font-size:0.9rem; font-weight:800; color:var(--warning);">${data.ai.hace}</div>
                        </div>
                    </div>
                ` : '<div style="color:var(--text-dim)">Procesando datos del mercado en vivo...</div>'}
            </div>

            <div class="card" style="margin-bottom:2rem;">
                <div class="card-title">📅 RENDIMIENTO DIARIO (FUTUROS)</div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Fecha</th><th>Resultado PnL</th><th>Cant.</th></tr></thead>
                        <tbody>
                            ${data.daily.map(d => `
                                <tr>
                                    <td style="font-weight:600;">${d.fecha}</td>
                                    <td style="font-weight:800; color:${parseFloat(d.pnl) >= 0 ? 'var(--success)' : 'var(--danger)'}">${parseFloat(d.pnl) >= 0 ? '+' : ''}${d.pnl} USDT</td>
                                    <td>${d.total} trades</td>
                                </tr>
                            `).slice(0, 10).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="card">
                <div class="card-title">📦 INVENTARIO SPOT (ETH)</div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="color:var(--text-dim)">Cantidad Total:</span>
                    <span style="font-weight:700; color:var(--primary)">${data.spot.balanceEth} ETH</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="color:var(--text-dim)">Valor en USDT:</span>
                    <span style="font-weight:700;">$${(parseFloat(data.spot.totalValue) - parseFloat(data.spot.balanceUsdt)).toFixed(2)}</span>
                </div>
                <div style="height:8px; background:rgba(255,255,255,0.05); border-radius:4px; margin: 15px 0;">
                    <div style="height:100%; background:var(--primary); width:60%; border-radius:4px;"></div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
    const ctx = document.getElementById('yieldChart').getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, 'rgba(14, 165, 233, 0.3)');
    grad.addColorStop(1, 'rgba(14, 165, 233, 0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ${JSON.stringify(data.chart.labels)},
            datasets: [{
                label: 'PnL Acumulado',
                data: ${JSON.stringify(data.chart.data)},
                borderColor: '#0ea5e9',
                borderWidth: 3,
                backgroundColor: grad,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#0ea5e9',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { weight: '600' } } },
                x: { grid: { display: false }, ticks: { color: '#64748b' } }
            }
        }
    });
</script>
</body>
</html>`;

// ═══════════════════════════════════════════
// DATA LOGIC (TOTALS & KPIs)
// ═══════════════════════════════════════════
async function getDashboardData(period, userId) {
    const [userRow] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const user = userRow[0];
    if (!user) return null;

    const traderFuturos = require('./src/trader');
    const traderSpot = require('./src/spot/trader');

    // Fetch live balances
    const [balFut, balSpot] = await Promise.all([
        traderFuturos.getBalance(user).catch(() => 0),
        traderSpot.getSpotBalance(user).catch(() => ({ usdt: 0, eth: 0 }))
    ]);

    // Time filter
    let tf = `user_id = ${userId}`;
    if (period === 'today') tf += ` AND DATE(timestamp_apertura) = CURDATE()`;
    else if (period === '7days') tf += ` AND timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;

    const tfCierre = tf.replace('timestamp_apertura', 'timestamp_cierre');
    const tfDec = tf.replace('timestamp_apertura', 'timestamp');

    // 1. FUTURES STATS
    const [fStats] = await db.execute(`
        SELECT COUNT(*) as total, SUM(resultado='WIN') as win, SUM(ganancia_perdida) as pnl
        FROM bot_trades WHERE timestamp_cierre IS NOT NULL AND ${tfCierre}
    `);

    // 2. SPOT STATS
    const [sStats] = await db.execute(`
        SELECT COUNT(*) as total, 
               SUM(CASE WHEN accion='BUY' THEN capital_usdt ELSE 0 END) as buys,
               SUM(CASE WHEN accion='SELL' THEN capital_usdt ELSE 0 END) as sells
        FROM spot_trades WHERE ${tf}
    `);

    // 3. COMBINED TRADES WITH PnL
    const [fTrades] = await db.execute(`SELECT 'FUTUROS' as bot, direccion as accion, precio_entrada as precio, capital_usado as detalle, resultado, ganancia_perdida as pnl, timestamp_apertura as hora FROM bot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 20`);
    const [sTrades] = await db.execute(`SELECT 'SPOT' as bot, accion, precio_entrada as precio, cantidad_eth as detalle, 'FINALIZADO' as resultado, 0 as pnl, timestamp_apertura as hora FROM spot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 20`);
    
    const allTrades = [...fTrades, ...sTrades].sort((a,b) => b.hora - a.hora).slice(0, 30);
    const fmt = (d) => new Date(d).toLocaleString('es-SV', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
    
    allTrades.forEach(t => {
        t.badgeClass = t.accion.includes('LONG') ? 'badge-long' : t.accion.includes('SHORT') ? 'badge-short' : t.accion === 'BUY' ? 'badge-buy' : 'badge-sell';
        t.pnl = t.bot === 'FUTUROS' && t.resultado !== 'OPEN' ? parseFloat(t.pnl || 0).toFixed(2) : '--';
        t.hora = fmt(t.hora);
        t.precio = parseFloat(t.precio).toFixed(2);
    });

    // 4. CHART DATA
    const [pnlRows] = await db.execute(`
        SELECT DATE_FORMAT(timestamp_cierre, '%d/%m %H:00') as x, SUM(ganancia_perdida) as y 
        FROM bot_trades 
        WHERE user_id = ? AND timestamp_cierre IS NOT NULL 
        GROUP BY x ORDER BY MIN(timestamp_cierre) ASC
    `, [userId]);
    let ac = 0;
    const chart = { labels: pnlRows.map(r=>r.x), data: pnlRows.map(r=>(ac+=parseFloat(r.y)).toFixed(2)) };

    // 5. DAILY LIST
    const [dailyRows] = await db.execute(`
        SELECT DATE_FORMAT(timestamp_cierre, '%Y-%m-%d') as fecha, SUM(ganancia_perdida) as pnl, COUNT(*) as total
        FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL
        GROUP BY fecha ORDER BY fecha DESC LIMIT 15
    `, [userId]);

    // Global KPI Calculation
    const spotEstimatedValue = parseFloat(balSpot.usdt) + (parseFloat(balSpot.eth) * 2500); // Placeholder price for estimation
    const totalBalance = (parseFloat(balFut) + spotEstimatedValue).toFixed(2);
    const totalPnL = (parseFloat(fStats[0].pnl || 0)).toFixed(2); // Spot PnL is harder to define without "closed trade" logic, using Future PnL as lead
    const fWinRate = fStats[0].total > 0 ? Math.round((fStats[0].win / fStats[0].total) * 100) : 0;

    return {
        userId: user.id,
        userName: user.nombre,
        userRole: user.role,
        global: {
            totalBalance,
            totalPnL,
            totalTrades: (fStats[0].total || 0) + (sStats[0].total || 0),
            successRate: fWinRate
        },
        futuros: {
            balance: parseFloat(balFut).toFixed(2),
            pnl: parseFloat(fStats[0].pnl || 0).toFixed(2),
            winRate: fWinRate,
            totalTrades: fStats[0].total || 0
        },
        spot: {
            balanceUsdt: parseFloat(balSpot.usdt).toFixed(2),
            balanceEth: parseFloat(balSpot.eth).toFixed(6),
            totalValue: spotEstimatedValue.toFixed(2),
            totalTrades: sStats[0].total || 0
        },
        trades: allTrades,
        ai: (await db.execute(`SELECT * FROM bot_decisions WHERE ${tfDec} ORDER BY id DESC LIMIT 1`))[0][0] ? {
            ... (await db.execute(`SELECT * FROM bot_decisions WHERE ${tfDec} ORDER BY id DESC LIMIT 1`))[0][0],
            hace: Math.round((Date.now() - new Date((await db.execute(`SELECT * FROM bot_decisions WHERE ${tfDec} ORDER BY id DESC LIMIT 1`))[0][0].timestamp))/60000) + ' min',
            rsi: (await db.execute(`SELECT * FROM bot_decisions WHERE ${tfDec} ORDER BY id DESC LIMIT 1`))[0][0].rsi || '--'
        } : null,
        chart,
        daily: dailyRows.map(r=>({ fecha: r.fecha, pnl: parseFloat(r.pnl).toFixed(2), total: r.total }))
    };
}

// ═══════════════════════════════════════════
// SERVER SETUP
// ═══════════════════════════════════════════
app.get('/login', (req, res) => res.send(loginHTML()));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE nombre = ? AND password = ? AND activo = 1', [username, password]);
        if (rows.length > 0) {
            req.session.loggedIn = true; req.session.userId = rows[0].id; req.session.userRole = rows[0].role;
            res.redirect('/');
        } else { res.send(loginHTML('Credenciales incorrectas')); }
    } catch (e) { res.send(loginHTML('Error de servidor')); }
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
            <select onchange="window.location.href='/?user_id='+this.value" style="margin-left:20px;">
                ${users.map(u => `<option value="${u.id}" ${userId == u.id ? 'selected' : ''}>${u.nombre}</option>`).join('')}
            </select>`;
        html = html.replace('<!-- SELECTOR_USUARIO -->', selector);
    }
    res.send(html);
});

app.listen(PORT, () => console.log(`WINTRADE Suite on port ${PORT}`));
