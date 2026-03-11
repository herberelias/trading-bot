require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'trading-bot-super-secret-2026',
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
<meta charset="UTF-8"><title>Login - Bot</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Outfit', sans-serif; background: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: white; }
  .card { background: #1e293b; padding: 40px; border-radius: 24px; width: 100%; max-width: 360px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); text-align: center; }
  input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 12px; border: 1px solid #334155; background: #0f172a; color: white; outline: none; box-sizing: border-box; }
  button { width: 100%; padding: 12px; border-radius: 12px; border: none; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; font-weight: 800; cursor: pointer; margin-top: 10px; }
  .error { color: #f87171; font-size: 0.8rem; margin-top: 10px; }
</style>
</head>
<body>
<div class="card">
  <h1 style="margin-bottom:5px;">Trading Bot</h1>
  <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:30px;">Inicia sesión para continuar</p>
  <form method="POST" action="/login">
    <input type="text" name="username" placeholder="Usuario" required>
    <input type="password" name="password" placeholder="Contraseña" required>
    ${error ? `<div class="error">${error}</div>` : ''}
    <button type="submit">ENTRAR</button>
  </form>
</div>
</body>
</html>`;

// ═══════════════════════════════════════════
// DASHBOARD HTML (FULL UI RESTORED)
// ═══════════════════════════════════════════
const dashboardHTML = (data, period) => `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Dashboard — ${data.userName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg: #0b0f19; --card: #161b2a; --border: #232a3d;
            --text: #ffffff; --text2: #94a3b8; --primary: #6366f1;
            --green: #10b981; --red: #ef4444; --blue: #3b82f6;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; font-size: 0.9rem; }
        
        header { background: rgba(22, 27, 42, 0.8); backdrop-filter: blur(10px); padding: 15px 30px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1000; }
        .nav-tabs { display: flex; gap: 10px; background: #0b0f19; padding: 5px; border-radius: 12px; }
        .nav-link { padding: 8px 16px; border-radius: 8px; text-decoration: none; color: var(--text2); font-weight: 600; font-size: 0.8rem; }
        .nav-link.active { background: var(--primary); color: white; }

        .container { max-width: 1400px; margin: 0 auto; padding: 30px; }
        
        .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 25px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; position: relative; overflow: hidden; }
        .card::before { content: ""; position: absolute; top: 0; right: 0; width: 100px; height: 100px; background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%); }
        
        .label { color: var(--text2); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .value { font-size: 1.8rem; font-weight: 800; display: flex; align-items: baseline; gap: 8px; }
        .sub-value { font-size: 0.8rem; color: var(--text2); font-weight: 400; }

        .grid-main { display: grid; grid-template-columns: 2fr 1.2fr; gap: 20px; }
        .section-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; padding: 12px; color: var(--text2); border-bottom: 1px solid var(--border); font-size: 0.75rem; text-transform: uppercase; }
        td { padding: 14px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.85rem; }
        
        .badge { padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; }
        .badge-long { background: rgba(16, 185,129, 0.15); color: var(--green); }
        .badge-short { background: rgba(239, 68, 68, 0.15); color: var(--red); }
        .badge-buy { background: rgba(59, 130, 246, 0.15); color: var(--blue); }
        .badge-sell { background: rgba(168, 85, 247, 0.15); color: #a855f7; }

        .ai-reason { background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 12px; padding: 15px; font-size: 0.85rem; line-height: 1.6; color: #cbd5e1; }
        
        select { background: #1e293b; color: white; border: 1px solid var(--border); padding: 8px 12px; border-radius: 10px; outline: none; font-family: inherit; font-weight: 600; cursor: pointer; }
    </style>
</head>
<body>

<header>
    <div style="display:flex; align-items:center; gap:25px;">
        <div style="font-size:1.5rem;">🤖 <span style="font-weight:800; letter-spacing:-1px;">ANTIGRAVITY</span></div>
        <div class="nav-tabs">
            <a href="/?period=today" class="nav-link ${period === 'today' ? 'active' : ''}">HOY</a>
            <a href="/?period=7days" class="nav-link ${period === '7days' ? 'active' : ''}">7 DÍAS</a>
            <a href="/?period=all" class="nav-link ${period === 'all' ? 'active' : ''}">TOTAL</a>
        </div>
        <!-- SELECTOR_USUARIO -->
    </div>
    <div style="display:flex; align-items:center; gap:20px;">
        <div style="text-align:right">
            <div style="font-weight:700;">${data.userName}</div>
            <div style="font-size:0.7rem; color:var(--text2); text-transform:uppercase;">${data.userRole}</div>
        </div>
        <a href="/logout" style="color:var(--red); text-decoration:none; font-weight:700; font-size:0.8rem; border:1px solid var(--red); padding:6px 15px; border-radius:10px;">SALIR</a>
    </div>
</header>

<div class="container">
    <div class="grid-stats">
        <div class="card">
            <div class="label">Balance Futuros</div>
            <div class="value" style="color:var(--primary)">$${data.balanceFuturos} <span class="sub-value">USDT</span></div>
        </div>
        <div class="card">
            <div class="label">Balance Spot</div>
            <div class="value" style="color:var(--blue)">$${data.balanceSpotUsdt} <span class="sub-value">${data.balanceSpotEth} ETH</span></div>
        </div>
        <div class="card">
            <div class="label">Resultado PNL</div>
            <div class="value" style="color:${parseFloat(data.stats.pnl) >= 0 ? 'var(--green)' : 'var(--red)'}">
                ${parseFloat(data.stats.pnl) >= 0 ? '+' : ''}${data.stats.pnl} <span class="sub-value">USDT</span>
            </div>
        </div>
        <div class="card">
            <div class="label">Eficiencia (Win Rate)</div>
            <div class="value">${data.stats.winRate}%</div>
            <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; margin-top:10px;">
                <div style="height:100%; background:var(--green); width:${data.stats.winRate}%; border-radius:2px; box-shadow: 0 0 10px var(--green);"></div>
            </div>
        </div>
    </div>

    <div class="grid-main">
        <div>
            <div class="card" style="margin-bottom:20px;">
                <div class="section-title">📊 Probabilidad de Crecimiento</div>
                <div style="height:250px;"><canvas id="mainChart"></canvas></div>
            </div>

            <div class="card">
                <div class="section-title">🕒 Historial de Operaciones</div>
                <table>
                    <thead>
                        <tr><th>Bot</th><th>Operación</th><th>Precio</th><th>Volumen</th><th>Estado</th><th>Fecha</th></tr>
                    </thead>
                    <tbody>
                        ${data.trades.length > 0 ? data.trades.map(t => `
                            <tr>
                                <td><span style="color:var(--text2)">${t.bot}</span></td>
                                <td><span class="badge ${t.accion.includes('LONG') || t.accion.includes('BUY') ? 'badge-long' : 'badge-short'}">${t.accion}</span></td>
                                <td><b>$${t.precio}</b></td>
                                <td>${t.detalle}</td>
                                <td><span style="color:${t.resultado === 'WIN' ? 'var(--green)' : t.resultado === 'LOSS' ? 'var(--red)' : 'var(--text2)'}">${t.resultado || 'ABIERTA'}</span></td>
                                <td style="color:var(--text2); font-size:0.75rem;">${t.hora}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="6" style="text-align:center; color:var(--text2)">Sin actividad en este rango</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>

        <div>
            <div class="card" style="margin-bottom:20px;">
                <div class="section-title">🧠 Último Análisis IA</div>
                ${data.analysis ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <span class="badge ${data.analysis.accion === 'LONG' ? 'badge-long' : 'badge-short'}" style="font-size:1rem; padding:8px 15px;">${data.analysis.accion}</span>
                        <span style="color:var(--text2); font-size:0.8rem;">Hace ${data.analysis.hace}</span>
                    </div>
                    <div class="ai-reason">${data.analysis.razon}</div>
                    <div style="margin-top:15px; display:flex; gap:10px;">
                        <div style="flex:1; background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; text-align:center;">
                            <div class="label">Confianza</div>
                            <div style="font-weight:700; color:var(--primary)">${Math.round(data.analysis.confianza * 100)}%</div>
                        </div>
                        <div style="flex:1; background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; text-align:center;">
                            <div class="label">RSI</div>
                            <div style="font-weight:700;">${data.analysis.rsi || '--'}</div>
                        </div>
                    </div>
                ` : '<div style="color:var(--text2)">Esperando nueva señal...</div>'}
            </div>

            <div class="card">
                <div class="section-title">📈 Resumen Diario</div>
                <table>
                    <thead><tr><th>Fecha</th><th>PnL</th><th>Trades</th></tr></thead>
                    <tbody>
                        ${data.daily.map(d => `
                            <tr>
                                <td>${d.fecha}</td>
                                <td style="color:${parseFloat(d.pnl) >= 0 ? 'var(--green)' : 'var(--red)'}">${parseFloat(d.pnl) >= 0?'+':''}${d.pnl}</td>
                                <td>${d.total}</td>
                            </tr>
                        `).slice(0, 10).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<script>
    const ctx = document.getElementById('mainChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ${JSON.stringify(data.chart.labels)},
            datasets: [{
                label: 'PnL Acumulado',
                data: ${JSON.stringify(data.chart.data)},
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointBackgroundColor: '#6366f1'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
</script>
</body>
</html>`;

// ═══════════════════════════════════════════
// LOGICA DE DATOS
// ═══════════════════════════════════════════
async function getDashboardData(period, userId) {
    const [userRow] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const user = userRow[0];
    if (!user) return null;

    const traderFuturos = require('./src/trader');
    const traderSpot = require('./src/spot/trader');

    const [balFut, balSpot] = await Promise.all([
        traderFuturos.getBalance(user).catch(() => 0),
        traderSpot.getSpotBalance(user).catch(() => ({ usdt: 0, eth: 0 }))
    ]);

    let timeframe = `user_id = ${userId}`;
    if (period === 'today') timeframe += ` AND DATE(timestamp_apertura) = CURDATE()`;
    else if (period === '7days') timeframe += ` AND timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;

    let timeframeCierre = timeframe.replace('timestamp_apertura', 'timestamp_cierre');
    let timeframeDec = timeframe.replace('timestamp_apertura', 'timestamp');

    // Stats
    const [statsRow] = await db.execute(`
        SELECT COUNT(*) as total, 
               SUM(resultado='WIN') as win, 
               SUM(ganancia_perdida) as pnl,
               SUM(comision) as fees
        FROM bot_trades WHERE timestamp_cierre IS NOT NULL AND ${timeframeCierre}
    `);
    
    // Trades combinados
    const [ftrades] = await db.execute(`SELECT 'Futuros' as bot, direccion as accion, precio_entrada as precio, capital_usado as detalle, resultado, timestamp_apertura as hora FROM bot_trades WHERE ${timeframe} ORDER BY hora DESC LIMIT 15`);
    const [strades] = await db.execute(`SELECT 'Spot' as bot, accion, precio_entrada as precio, cantidad_eth as detalle, 'FINALIZADO' as resultado, timestamp_apertura as hora FROM spot_trades WHERE ${timeframe} ORDER BY hora DESC LIMIT 15`);
    
    const allTrades = [...ftrades, ...strades].sort((a,b) => b.hora - a.hora).slice(0, 20);
    const fmt = (d) => new Date(d).toLocaleString('es-SV', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
    allTrades.forEach(t => t.hora = fmt(t.hora));

    // Analisis
    const [decisions] = await db.execute(`SELECT * FROM bot_decisions WHERE ${timeframeDec} ORDER BY timestamp DESC LIMIT 1`);
    const lastDec = decisions[0];

    // Chart
    const [pnlRows] = await db.execute(`
        SELECT DATE_FORMAT(timestamp_cierre, '%d/%m %H:00') as x, SUM(ganancia_perdida) as y 
        FROM bot_trades 
        WHERE user_id = ? AND timestamp_cierre IS NOT NULL 
        GROUP BY x ORDER BY MIN(timestamp_cierre) ASC LIMIT 50
    `, [userId]);
    let ac = 0;
    const chart = { labels: pnlRows.map(r=>r.x), data: pnlRows.map(r=>(ac+=parseFloat(r.y)).toFixed(2)) };

    // Daily
    const [dailyRows] = await db.execute(`
        SELECT DATE_FORMAT(timestamp_cierre, '%Y-%m-%d') as fecha, SUM(ganancia_perdida) as pnl, COUNT(*) as total
        FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL
        GROUP BY fecha ORDER BY fecha DESC LIMIT 15
    `, [userId]);

    return {
        userName: user.nombre,
        userRole: user.role,
        balanceFuturos: parseFloat(balFut).toFixed(2),
        balanceSpotUsdt: parseFloat(balSpot.usdt).toFixed(2),
        balanceSpotEth: parseFloat(balSpot.eth).toFixed(4),
        stats: {
            pnl: parseFloat(statsRow[0].pnl || 0).toFixed(2),
            winRate: statsRow[0].total > 0 ? Math.round((statsRow[0].win / statsRow[0].total) * 100) : 0,
            fees: parseFloat(statsRow[0].fees || 0).toFixed(2)
        },
        trades: allTrades,
        analysis: lastDec ? {
            accion: lastDec.accion,
            razon: lastDec.razon,
            confianza: lastDec.confianza,
            rsi: lastDec.rsi,
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
        } else { res.send(loginHTML('Credenciales incorrectas')); }
    } catch (e) { res.send(loginHTML('Error de conexión')); }
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

app.listen(PORT, () => console.log(`FULL Dashboard on port ${PORT}`));
