require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'wintrade-pro-secret-2026',
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
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - WINTRADE</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #020617; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: white; }
        .card { background: #0f172a; padding: 40px; border-radius: 32px; width: 90%; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #1e293b; text-align: center; }
        input { width: 100%; padding: 14px; margin: 12px 0; border-radius: 12px; border: 1px solid #334155; background: #020617; color: white; outline: none; box-sizing: border-box; }
        button { width: 100%; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; font-weight: 800; cursor: pointer; margin-top: 15px; }
        .error { color: #f87171; font-size: 0.8rem; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="card">
        <h1 style="font-weight:800; letter-spacing:-1px; margin-bottom:30px;">WINTRADE</h1>
        <form method="POST" action="/login">
            <input type="text" name="username" placeholder="Usuario" required>
            <input type="password" name="password" placeholder="Contraseña" required>
            ${error ? `<div class="error">${error}</div>` : ''}
            <button type="submit">ACCEDER</button>
        </form>
    </div>
</body>
</html>`;

// ═══════════════════════════════════════════
// DASHBOARD HTML (ULTRA-RESPONSIVE)
// ═══════════════════════════════════════════
const dashboardHTML = (data, period) => `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WINTRADE — Pro Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg: #020617; --card: #0f172a; --card-light: #1e293b; --border: #334155;
            --text: #f8fafc; --text-dim: #94a3b8; --primary: #3b82f6; --secondary: #a855f7;
            --success: #10b981; --danger: #ef4444; --warning: #f59e0b;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

        header { 
            background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); 
            padding: 1rem 2rem; border-bottom: 1px solid var(--border); 
            display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; 
            position: sticky; top: 0; z-index: 1000; gap: 1rem;
        }
        .logo { font-size: 1.4rem; font-weight: 800; letter-spacing: -1px; color: var(--primary); display: flex; align-items: center; gap: 8px; }
        .logo span { color: white; font-weight: 300; }

        .container { max-width: 1540px; margin: 0 auto; padding: 1.5rem; }

        /* Navigation Tabs */
        .tabs { display: flex; background: #000; padding: 4px; border-radius: 12px; gap: 4px; }
        .tab { padding: 8px 16px; border-radius: 8px; text-decoration: none; color: var(--text-dim); font-size: 0.75rem; font-weight: 700; transition: 0.2s; text-align: center; }
        .tab.active { background: var(--card-light); color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }

        /* KPI Layout */
        .kpi-row { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); 
            gap: 1.25rem; margin-bottom: 2rem; 
        }
        .kpi-card { 
            background: var(--card); border: 1px solid var(--border); 
            padding: 1.5rem; border-radius: 24px; 
            display: flex; flex-direction: column; justify-content: center;
            min-height: 120px;
        }
        .kpi-label { font-size: 0.7rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .kpi-value { font-size: 1.8rem; font-weight: 800; line-height: 1.2; }
        .kpi-sub { font-size: 0.75rem; color: var(--text-dim); margin-top: 4px; }

        /* Main Sections Layout */
        .main-grid { 
            display: grid; 
            grid-template-columns: 1fr 380px; 
            gap: 1.5rem; align-items: start;
        }
        @media (max-width: 1200px) { .main-grid { grid-template-columns: 1fr; } }

        .card { background: var(--card); border: 1px solid var(--border); border-radius: 28px; padding: 1.75rem; position: relative; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 10px; }
        .card-title { font-size: 1rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }

        /* Table Rendering */
        .table-wrap { overflow-x: auto; margin: -0.5rem; padding: 0.5rem; }
        table { width: 100%; border-collapse: collapse; min-width: 700px; }
        th { text-align: left; padding: 1rem; color: var(--text-dim); font-size: 0.7rem; text-transform: uppercase; border-bottom: 1px solid var(--border); font-weight: 700; }
        td { padding: 1.1rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.85rem; font-weight: 500; }
        
        /* Badges */
        .badge { padding: 4px 10px; border-radius: 8px; font-weight: 800; font-size: 0.65rem; text-transform: uppercase; }
        .b-long { background: rgba(16, 185, 129, 0.15); color: var(--success); }
        .b-short { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
        .b-spot { background: rgba(59, 130, 246, 0.15); color: var(--primary); }

        /* AI Section Custom Styles */
        .ai-box { background: rgba(0,0,0,0.3); border-radius: 20px; padding: 1.5rem; border: 1px solid var(--border); line-height: 1.6; }
        
        select { 
            background: var(--card-light); color: white; border: 1px solid var(--border); 
            padding: 8px 15px; border-radius: 14px; font-weight: 700; font-family: inherit;
            cursor: pointer; outline: none; transition: 0.2s;
        }
        select:hover { border-color: var(--primary); }

        /* Mobile Adjustments */
        @media (max-width: 600px) {
            header { padding: 1rem; justify-content: center; }
            .container { padding: 1rem; }
            .kpi-value { font-size: 1.5rem; }
            .card { padding: 1.25rem; }
        }
    </style>
</head>
<body>

<header>
    <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
        <div class="logo">WINTRADE <span>PRO</span></div>
        <div class="tabs">
            <a href="/?period=today" class="tab ${period === 'today' ? 'active' : ''}">HOY</a>
            <a href="/?period=7days" class="tab ${period === '7days' ? 'active' : ''}">7 DÍAS</a>
            <a href="/?period=all" class="tab ${period === 'all' ? 'active' : ''}">TOTAL</a>
        </div>
        <!-- SELECTOR_USUARIO -->
    </div>
    <div style="display:flex; align-items:center; gap:15px;">
        <div style="text-align:right;">
            <div style="font-weight:800; font-size:0.85rem;">${data.userName}</div>
            <div style="font-size:0.6rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:1px;">ID: ${data.userId} • ${data.userRole}</div>
        </div>
        <a href="/logout" style="text-decoration:none; color:var(--danger); border:1px solid var(--danger); padding:8px 14px; border-radius:12px; font-size:0.75rem; font-weight:800;">CERRAR</a>
    </div>
</header>

<div class="container">
    
    <!-- RESUMEN GLOBAL (Adaptable Grid) -->
    <div class="kpi-row">
        <div class="kpi-card">
            <div class="kpi-label">💼 Balance Futuros</div>
            <div class="kpi-value" style="color:var(--primary)">$${data.futuros.balance}</div>
            <div class="kpi-sub">USDT disponibles</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">💵 Balance Spot USDT</div>
            <div class="kpi-value" style="color:var(--success)">$${data.spot.balanceUsdt}</div>
            <div class="kpi-sub">USDT en cuenta Spot</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">🔷 Balance Spot ETH</div>
            <div class="kpi-value" style="color:#a78bfa">${data.spot.balanceEth}</div>
            <div class="kpi-sub">ETH en posición</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">⚡ Operaciones Ejecutadas</div>
            <div class="kpi-value">${data.global.executedTrades}</div>
            <div class="kpi-sub">${data.futuros.executedTrades} Futuros | ${data.spot.totalTrades} Spot</div>
        </div>
    </div>

    <!-- MAIN CONTENT GRID -->
    <div class="main-grid">
        
        <!-- LEFT COLUMN: PRIMARY DATA -->
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
            
            ${data.chart.data.length >= 2 ? `
            <div class="card" style="padding-bottom:1.25rem;">
                <div class="card-header">
                    <div class="card-title">Rendimiento Acumulado</div>
                </div>
                <div style="height:240px;"><canvas id="mainChart"></canvas></div>
            </div>
            ` : ''}

            <div class="card">
                <div class="card-header">
                    <div class="card-title">🕒 Historial de Transacciones</div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Bot/Módulo</th>
                                <th>Operación</th>
                                <th>P. Entrada</th>
                                <th>Cantidad</th>
                                <th>PnL / Estado</th>
                                <th>Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.trades.length > 0 ? data.trades.map(t => `
                                <tr>
                                    <td><span style="color:var(--text-dim); font-weight:700; font-size:0.75rem;">${t.bot}</span></td>
                                    <td><span class="badge ${t.badgeClass}">${t.accion}</span></td>
                                    <td><b>$${t.precio}</b></td>
                                    <td>${t.detalle}</td>
                                    <td>
                                        <span style="font-weight:800; color:${parseFloat(t.pnl) > 0 ? 'var(--success)' : parseFloat(t.pnl) < 0 ? 'var(--danger)' : 'var(--text-dim)'}">
                                            ${t.pnl !== '--' ? (parseFloat(t.pnl) >= 0 ? '+' : '') + t.pnl + ' USDT' : t.resultado}
                                        </span>
                                    </td>
                                    <td style="color:var(--text-dim); font-size:0.7rem;">${t.hora}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-dim);">No se registraron movimientos en este periodo.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- RIGHT COLUMN: INSIGHTS & UTILS -->
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
            
            <!-- AI INSIGHTS CARD -->
            <div class="card" style="border: 1px solid rgba(59, 130, 246, 0.3);">
                <div class="card-title" style="color:var(--primary); margin-bottom:1.5rem;">🧠 Inteligencia Artificial</div>
                ${data.ai ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                        <span class="badge ${data.ai.accion.includes('LONG') || data.ai.accion.includes('BUY') ? 'b-long' : 'b-short'}" style="font-size:1.1rem; padding:10px 20px;">${data.ai.accion}</span>
                        <div style="text-align:right">
                            <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800;">CONFIANZA</div>
                            <div style="font-size:1.4rem; font-weight:900; color:var(--secondary);">${Math.round(data.ai.confianza * 100)}%</div>
                        </div>
                    </div>
                    <div class="ai-box" style="font-size:0.85rem; color:#cbd5e1;">${data.ai.razon}</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:1.5rem;">
                        <div style="background:var(--card-light); padding:12px; border-radius:15px; text-align:center; border:1px solid var(--border);">
                            <div class="kpi-label" style="margin:0;">RSI M15</div>
                            <div style="font-size:1.1rem; font-weight:800;">${data.ai.rsi}</div>
                        </div>
                        <div style="background:var(--card-light); padding:12px; border-radius:15px; text-align:center; border:1px solid var(--border);">
                            <div class="kpi-label" style="margin:0;">Vigencia</div>
                            <div style="font-size:0.8rem; font-weight:800; color:var(--warning);">${data.ai.hace}</div>
                        </div>
                    </div>
                ` : '<div style="color:var(--text-dim); text-align:center; padding:2rem;">Analizando fluctuaciones...</div>'}
            </div>

            <!-- DAILY PERFORMANCE TABLE (MINI) -->
            <div class="card">
                <div class="card-title">📅 Diario (Futuros)</div>
                <div class="table-wrap" style="margin-top:1rem;">
                    <table>
                        <thead><tr><th>Fecha</th><th>PnL</th><th>Ops</th></tr></thead>
                        <tbody>
                            ${data.daily.map(d => `
                                <tr>
                                    <td style="font-size:0.8rem; font-weight:600;">${d.fecha}</td>
                                    <td style="font-weight:800; color:${parseFloat(d.pnl) >= 0 ? 'var(--success)' : 'var(--danger)'}">${parseFloat(d.pnl) >= 0 ? '+' : ''}${d.pnl}</td>
                                    <td style="font-size:0.75rem;">${d.total}</td>
                                </tr>
                            `).slice(0, 8).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- SPOT INVENTORY CARD -->
            <div class="card">
                <div class="card-title">📦 Inventario Spot (ETH)</div>
                <div style="margin-top:1.25rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="color:var(--text-dim); font-size:0.8rem;">Reservas ETH:</span>
                        <span style="font-weight:800; color:var(--primary)">${data.spot.balanceEth} ETH</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <span style="color:var(--text-dim); font-size:0.8rem;">Valoración USDT:</span>
                        <span style="font-weight:800;">$${data.spot.estimatedValue}</span>
                    </div>
                    <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px;">
                        <div style="height:100%; background:var(--primary); width:75%; border-radius:3px; opacity:0.8;"></div>
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>

<script>
    const canvas = document.getElementById('mainChart');
    if (canvas) {
        const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ${JSON.stringify(data.chart.labels)},
            datasets: [{
                label: 'PnL',
                data: ${JSON.stringify(data.chart.data)},
                borderColor: '#3b82f6',
                borderWidth: 4,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointBackgroundColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false },
            plugins: { 
                legend: { display: false }, 
                tooltip: { enabled: false } 
            },
            scales: {
                y: { display: false, grid: { display: false } },
                x: { display: false, grid: { display: false } }
            }
        }
    });
    }
</script>
</body>
</html>`;

// ═══════════════════════════════════════════
// DATA AGGREGATOR (CLEAN & ACCURATE)
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

    let tf = `user_id = ${userId}`;
    if (period === 'today') tf += ` AND DATE(timestamp_apertura) = CURDATE()`;
    else if (period === '7days') tf += ` AND timestamp_apertura >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;

    const tfCierre = tf.replace('timestamp_apertura', 'timestamp_cierre');
    const tfDec = tf.replace('timestamp_apertura', 'timestamp');

    // Stats Calculations
    const [fStats] = await db.execute(`SELECT COUNT(*) as total, SUM(resultado='WIN') as win, SUM(resultado='WIN' OR resultado='LOSS') as executed, SUM(ganancia_perdida) as pnl FROM bot_trades WHERE ${tfCierre.replace(new RegExp('timestamp_cierre','g'), 'timestamp_apertura')}`);
    const [fExecuted] = await db.execute(`SELECT COUNT(*) as executed FROM bot_trades WHERE timestamp_cierre IS NOT NULL AND ${tfCierre}`);
    const [sStats] = await db.execute(`SELECT COUNT(*) as total FROM spot_trades WHERE ${tf}`);
    
    // Recent Combined Activity
    const [fTrades] = await db.execute(`SELECT 'FUTURES' as bot, direccion as accion, precio_entrada as precio, capital_usado as detalle, resultado, ganancia_perdida as pnl, timestamp_apertura as hora FROM bot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 20`);
    const [sTrades] = await db.execute(`SELECT 'SPOT' as bot, accion, precio_entrada as precio, cantidad_eth as detalle, 'FINALIZADO' as resultado, 0 as pnl, timestamp_apertura as hora FROM spot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 20`);
    
    const allTrades = [...fTrades, ...sTrades].sort((a,b) => b.hora - a.hora).slice(0, 25);
    const fmt = (d) => new Date(d).toLocaleString('es-SV', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
    
    allTrades.forEach(t => {
        t.badgeClass = t.accion.includes('LONG') ? 'b-long' : t.accion.includes('SHORT') ? 'b-short' : 'b-spot';
        t.pnl = t.bot === 'FUTURES' && t.resultado !== 'OPEN' ? parseFloat(t.pnl || 0).toFixed(2) : '--';
        t.hora = fmt(t.hora);
        t.precio = parseFloat(t.precio).toFixed(2);
    });

    // Charting
    const [pnlRows] = await db.execute(`SELECT DATE_FORMAT(timestamp_cierre, '%d/%m %H:00') as x, SUM(ganancia_perdida) as y FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL GROUP BY x ORDER BY MIN(timestamp_cierre) ASC LIMIT 50`, [userId]);
    let ac = 0;
    const chart = { labels: pnlRows.map(r=>r.x), data: pnlRows.map(r=>(ac+=parseFloat(r.y)).toFixed(2)) };

    // Performance List
    const [dailyRows] = await db.execute(`SELECT DATE_FORMAT(timestamp_cierre, '%Y-%m-%d') as fecha, SUM(ganancia_perdida) as pnl, COUNT(*) as total FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL GROUP BY fecha ORDER BY fecha DESC LIMIT 10`, [userId]);

    const executedFuturos = fExecuted[0].executed || 0;
    const executedSpot   = sStats[0].total || 0;

    return {
        userId: user.id, userName: user.nombre, userRole: user.role,
        global: {
            executedTrades: executedFuturos + executedSpot
        },
        futuros: {
            balance: parseFloat(balFut).toFixed(2),
            totalTrades: fStats[0].total || 0,
            executedTrades: executedFuturos
        },
        spot: {
            balanceUsdt: parseFloat(balSpot.usdt).toFixed(2),
            balanceEth:  parseFloat(balSpot.eth).toFixed(6),
            totalTrades: executedSpot
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
// APP SERVER
// ═══════════════════════════════════════════
app.get('/login', (req, res) => res.send(loginHTML()));
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE nombre = ? AND password = ? AND activo = 1', [username, password]);
        if (rows.length > 0) {
            req.session.loggedIn = true; req.session.userId = rows[0].id; req.session.userRole = rows[0].role;
            res.redirect('/');
        } else { res.send(loginHTML('Credenciales inválidas')); }
    } catch (e) { res.send(loginHTML('Error de sistema')); }
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
        const selector = `<select onchange="window.location.href='/?user_id='+this.value" style="margin-left:15px;">
            ${users.map(u => `<option value="${u.id}" ${userId == u.id ? 'selected' : ''}>${u.nombre}</option>`).join('')}
        </select>`;
        html = html.replace('<!-- SELECTOR_USUARIO -->', selector);
    }
    res.send(html);
});

app.listen(PORT, () => console.log(`WINTRADE Pro UI Ready on ${PORT}`));
