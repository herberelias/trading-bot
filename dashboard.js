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
        .b-hold { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }

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
        ${data.userRole === 'admin' ? `<a href="/admin" style="text-decoration:none; color:#a78bfa; border:1px solid rgba(139,92,246,0.4); padding:8px 14px; border-radius:12px; font-size:0.75rem; font-weight:800;">⚙️ ADMIN</a>` : ''}
        <a href="/perfil" style="text-decoration:none; color:var(--text-dim); border:1px solid var(--border); padding:8px 14px; border-radius:12px; font-size:0.75rem; font-weight:800;">👤 PERFIL</a>
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

    <!-- IA SECCION COMPLETA: FUTUROS + SPOT EN PARALELO -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:2rem;">

        <!-- IA FUTUROS -->
        <div class="card" style="border:1px solid rgba(99,102,241,0.35);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-size:0.65rem; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; color:var(--secondary); margin-bottom:6px;">IA FUTUROS (BTC)</div>
                    ${data.aiFuturos ? (() => {
                        let cls = 'b-hold';
                        if (data.aiFuturos.accion === 'LONG') cls = 'b-long';
                        if (data.aiFuturos.accion === 'SHORT') cls = 'b-short';
                        return `<span class="badge ${cls}" style="font-size:1rem; padding:10px 22px;">${data.aiFuturos.accion}</span>`;
                    })() : ''}
                </div>
                ${data.aiFuturos ? `
                <div style="text-align:right;">
                    <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800;">CONFIANZA</div>
                    <div style="font-size:1.8rem; font-weight:900; color:var(--secondary); line-height:1;">${Math.round(data.aiFuturos.confianza * 100)}%</div>
                    <div style="font-size:0.7rem; color:var(--warning); margin-top:3px;">${data.aiFuturos.hace}</div>
                </div>` : ''}
            </div>
            ${data.aiFuturos 
                ? `<div class="ai-box" style="font-size:0.92rem; line-height:1.8; color:#e2e8f0; max-height:200px; overflow-y:auto;">${data.aiFuturos.razon}</div>`
                : `<div style="color:var(--text-dim); text-align:center; padding:2.5rem;">Sin señal activa</div>`
            }
        </div>

        <!-- IA SPOT -->
        <div class="card" style="border:1px solid rgba(16,185,129,0.35);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-size:0.65rem; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; color:var(--success); margin-bottom:6px;">IA SPOT (ETH)</div>
                    ${data.aiSpot ? (() => {
                        let cls = 'b-hold';
                        if (data.aiSpot.accion === 'BUY') cls = 'b-long';
                        if (data.aiSpot.accion === 'SELL') cls = 'b-short';
                        return `<span class="badge ${cls}" style="font-size:1rem; padding:10px 22px;">${data.aiSpot.accion}</span>`;
                    })() : ''}
                </div>
                ${data.aiSpot ? `
                <div style="text-align:right;">
                    <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800;">CONFIANZA</div>
                    <div style="font-size:1.8rem; font-weight:900; color:${data.aiSpot.accion === 'HOLD / BLOQUEADO' ? 'var(--text-dim)' : 'var(--success)'}; line-height:1;">${Math.round(data.aiSpot.confianza * 100)}%</div>
                    <div style="font-size:0.7rem; color:var(--warning); margin-top:3px;">${data.aiSpot.hace}</div>
                </div>` : ''}
            </div>
            ${data.aiSpot 
                ? `<div class="ai-box" style="font-size:0.92rem; line-height:1.8; color:#e2e8f0; max-height:200px; overflow-y:auto;">${data.aiSpot.razon}</div>`
                : `<div style="color:var(--text-dim); text-align:center; padding:2.5rem;">Sin señal activa</div>`
            }
        </div>

    </div>

    <!-- MAIN CONTENT GRID -->
    <div class="main-grid">
        
        <!-- LEFT COLUMN: PRIMARY DATA -->
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
            


            <div class="card">
            <!-- TABLAS SEPARADAS 2 COL -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">

                <!-- TABLA FUTUROS -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title" style="color:var(--secondary);">BTC Futuros</div>
                        <span style="font-size:0.7rem; color:var(--text-dim); font-weight:700;">${data.futuros.totalTrades} ops</span>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Operación</th>
                                    <th>P. Entrada</th>
                                    <th>Margen</th>
                                    <th>P. Salida</th>
                                    <th>PnL</th>
                                    <th>Fecha</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.tradesFuturos.length > 0 ? data.tradesFuturos.map(t => `
                                    <tr>
                                        <td><span class="badge ${t.accion === 'LONG' ? 'b-long' : t.accion === 'SHORT' ? 'b-short' : 'b-spot'}">${t.accion}</span></td>
                                        <td><b>$${t.precioEntrada}</b></td>
                                        <td style="color:var(--text-dim);">${t.margen}</td>
                                        <td>${t.precioSalida !== '--' ? `<b>${t.precioSalida}</b>` : '<span style="color:var(--text-dim)">En curso</span>'}</td>
                                        <td style="font-weight:800; color:${t.pnl === null ? 'var(--text-dim)' : parseFloat(t.pnl) >= 0 ? 'var(--success)' : 'var(--danger)'};">
                                            ${t.pnl !== null ? (parseFloat(t.pnl) >= 0 ? '+' : '') + '$' + t.pnl : '--'}
                                        </td>
                                        <td style="color:var(--text-dim); font-size:0.7rem;">${t.fechaApertura}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-dim);">Sin operaciones</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- TABLA SPOT -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title" style="color:var(--success);">ETH Spot</div>
                        <span style="font-size:0.7rem; color:var(--text-dim); font-weight:700;">${data.spot.totalTrades} ops</span>
                    </div>

                    <!-- PNL RESUMEN SPOT -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:1.25rem;">
                        <div style="background:rgba(0,0,0,0.25); border-radius:14px; padding:12px; border:1px solid var(--border);">
                            <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800; margin-bottom:4px;">TOTAL COMPRADO</div>
                            <div style="font-weight:800; color:var(--danger);">-$${data.spotPnl.totalComprado}</div>
                            <div style="font-size:0.65rem; color:var(--text-dim);">${data.spotPnl.numCompras} BUYs</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.25); border-radius:14px; padding:12px; border:1px solid var(--border);">
                            <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800; margin-bottom:4px;">TOTAL VENDIDO</div>
                            <div style="font-weight:800; color:var(--success);">+$${data.spotPnl.totalVendido}</div>
                            <div style="font-size:0.65rem; color:var(--text-dim);">${data.spotPnl.numVentas} SELLs</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.25); border-radius:14px; padding:12px; border:1px solid var(--border);">
                            <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800; margin-bottom:4px;">PNL REALIZADO</div>
                            <div style="font-weight:800; color:${parseFloat(data.spotPnl.pnlRealizado) >= 0 ? 'var(--success)' : 'var(--danger)'};">
                                ${parseFloat(data.spotPnl.pnlRealizado) >= 0 ? '+' : ''}$${data.spotPnl.pnlRealizado}
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-dim);">SELL − BUY</div>
                        </div>
                        <div style="background:rgba(0,0,0,0.25); border-radius:14px; padding:12px; border:1px solid var(--border);">
                            <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800; margin-bottom:4px;">ETH EN CARTERA</div>
                            <div style="font-weight:800; color:#a78bfa;">${data.spotPnl.ethActual} ETH</div>
                            <div style="font-size:0.65rem; color:var(--text-dim);">≈ $${data.spotPnl.valorEthActual}</div>
                        </div>
                    </div>
                    <!-- TOTAL NETO -->
                    <div style="background:linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.08)); border:1px solid rgba(16,185,129,0.25); border-radius:14px; padding:14px 18px; margin-bottom:1.25rem; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:0.65rem; color:var(--text-dim); font-weight:800;">PNL TOTAL (Realizado + ETH en cartera)</div>
                            <div style="font-size:0.7rem; color:var(--text-dim);">Ventas + Valor ETH actual − Compras</div>
                        </div>
                        <div style="font-size:1.6rem; font-weight:900; color:${parseFloat(data.spotPnl.pnlTotal) >= 0 ? 'var(--success)' : 'var(--danger)'};">
                            ${parseFloat(data.spotPnl.pnlTotal) >= 0 ? '+' : ''}$${data.spotPnl.pnlTotal}
                        </div>
                    </div>

                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Operación</th><th>Precio</th><th>Monto USDT</th><th>Hora</th></tr>
                            </thead>
                            <tbody>
                                ${data.tradesSpot.length > 0 ? data.tradesSpot.map(t => `
                                    <tr>
                                        <td><span class="badge ${t.accion === 'BUY' ? 'b-long' : 'b-short'}">${t.accion}</span></td>
                                        <td><b>$${t.precio}</b></td>
                                        <td>${t.detalle}</td>
                                        <td style="color:var(--text-dim); font-size:0.7rem;">${t.hora}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-dim);">Sin operaciones</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>


        </div>
    </div>
</div>

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

    const [balFut, balSpot, ethPrecioReal] = await Promise.all([
        traderFuturos.getActualBalance(user).catch(() => 0),
        traderSpot.getSpotBalance(user).catch(() => ({ usdt: 0, eth: 0 })),
        traderSpot.getSpotPrice('ETH-USDT').catch(() => null)
    ]);
    const ethPrecioEst = ethPrecioReal || 0;

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
    let fTradesRaw = [];
    if (user.modo_real) {
        // Traer de BingX REAL
        const bingxOrders = await traderFuturos.getHistory(user, 30);
        fTradesRaw = bingxOrders
            .filter(o => o.status === 'FILLED') // Solo los ejecutados como en la app
            .slice(0, 15)
            .map(o => ({
                accion: o.side,
                precio_entrada: o.avgPrice || o.price,
                margen: (parseFloat(o.cumQuote || 0) / (parseFloat(user.apalancamiento) || 10)).toFixed(2),
                precio_cierre: o.avgPrice || o.price,
                ganancia_perdida: o.profit,
                resultado: parseFloat(o.profit) > 0 ? 'WIN' : 'LOSS',
                timestamp_apertura: o.updateTime,
                timestamp_cierre: o.updateTime,
                isReal: true
            }));
    } else {
        // Traer de DB (Simulado)
        const [rows] = await db.execute(`SELECT direccion as accion, precio_entrada, capital_usado as margen, precio_cierre, ganancia_perdida, resultado, timestamp_apertura, timestamp_cierre FROM bot_trades WHERE ${tf} ORDER BY timestamp_apertura DESC LIMIT 20`);
        fTradesRaw = rows;
    }

    let sTradesRaw = [];
    if (user.modo_real) {
        try {
            const bingxSpot = await traderSpot.getHistory(user, 'ETH-USDT', 50);
            let orders = Array.isArray(bingxSpot) ? bingxSpot : [];
            
            // Filtro de estado: Súper permisivo para debug
            orders = orders.filter(o => {
                const s = String(o.status).toUpperCase();
                return ['4','2','FILLED','PARTIALLY_FILLED','SUCCESS','CANCELED_PARTIALLY_FILLED','NEW','PENDING'].includes(s);
            });

            // En lugar de filtrar por 'hoy' o '7 dias' estrictamente para la lista,
            // vamos a mostrar las últimas órdenes para asegurar que veas ALGO.
            sTradesRaw = orders.slice(0, 20).map(o => {
                const qQty = parseFloat(o.cummulativeQuoteQty || 0);
                const eQty = parseFloat(o.executedQty || 0);
                const price = parseFloat(o.price || 0);
                const side = String(o.side || '').toUpperCase();
                
                return {
                    accion: (side.includes('BUY') || side === '1') ? 'BUY' : 'SELL',
                    precio: price > 0 ? price : (eQty > 0 ? qQty / eQty : 0),
                    monto_usdt: qQty,
                    hora: o.time,
                    isReal: true
                };
            });
        } catch (e) {
            console.error('[DASHBOARD] Error procesando Spot Real:', e.message);
        }
    } else {
        const [rows] = await db.execute(`SELECT accion, precio_entrada as precio, capital_usdt as monto_usdt, timestamp_apertura as hora FROM spot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 20`);
        sTradesRaw = rows;
    }

    const fmt = (d) => new Date(d).toLocaleString('es-SV', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
    const fmtUSDT = (v) => parseFloat(v || 0) > 0 ? `$${parseFloat(v).toFixed(2)} USDT` : '--';

    // Build separate formatted arrays BEFORE merging (avoid double-format bug)
    const tradesFuturos = fTradesRaw.map(t => ({
        accion: t.accion,
        precioEntrada: parseFloat(t.precio_entrada || 0).toFixed(2),
        margen: t.isReal ? `$${t.margen} USDT` : fmtUSDT(t.margen),
        precioSalida: t.precio_cierre ? `$${parseFloat(t.precio_cierre).toFixed(2)}` : '--',
        pnl: t.ganancia_perdida != null ? parseFloat(t.ganancia_perdida).toFixed(2) : null,
        resultado: t.resultado || 'OPEN',
        fechaApertura: fmt(t.timestamp_apertura),
        fechaCierre: t.timestamp_cierre ? fmt(t.timestamp_cierre) : '--'
    }));
    const tradesSpot = sTradesRaw.map(t => ({
        accion: t.accion,
        precio: parseFloat(t.precio).toFixed(2),
        detalle: fmtUSDT(t.monto_usdt),
        hora: fmt(t.hora)
    }));

    // Combined (legacy, keep for chart compat)
    const allTrades = [...fTradesRaw, ...sTradesRaw].sort((a,b) => new Date(b.hora) - new Date(a.hora)).slice(0, 25);
    allTrades.forEach(t => {
        t.hora = fmt(t.hora);
        t.precio = parseFloat(t.precio).toFixed(2);
    });

    // Charting (Disabled)
    const chart = { labels: [], data: [] };

    // Performance List
    const [dailyRows] = await db.execute(`SELECT DATE_FORMAT(timestamp_cierre, '%Y-%m-%d') as fecha, SUM(ganancia_perdida) as pnl, COUNT(*) as total FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL GROUP BY fecha ORDER BY fecha DESC LIMIT 10`, [userId]);

    const executedFuturos = fExecuted[0].executed || 0;
    const executedSpot   = sStats[0].total || 0;

    // Spot PnL: algoritmo compra-venta
    let spotPnl = {};
    if (user.modo_real) {
        // En modo real calculamos desde lo que nos devolvió BingX (sTradesRaw)
        const tBought = sTradesRaw.filter(t => t.accion === 'BUY').reduce((sum, t) => sum + parseFloat(t.monto_usdt || 0), 0);
        const tSold   = sTradesRaw.filter(t => t.accion === 'SELL').reduce((sum, t) => sum + parseFloat(t.monto_usdt || 0), 0);
        const nBuy    = sTradesRaw.filter(t => t.accion === 'BUY').length;
        const nSell   = sTradesRaw.filter(t => t.accion === 'SELL').length;
        
        const ethActual      = parseFloat(balSpot.eth || 0);
        const valorEthActual = ethActual * ethPrecioEst;
        const pnlTotal       = (tSold - tBought) + valorEthActual;

        spotPnl = {
            totalComprado:  tBought.toFixed(2),
            totalVendido:   tSold.toFixed(2),
            numCompras:     nBuy,
            numVentas:      nSell,
            pnlRealizado:   (tSold - tBought).toFixed(2),
            valorEthActual: valorEthActual.toFixed(2),
            pnlTotal:       pnlTotal.toFixed(2),
            ethActual:      ethActual.toFixed(6)
        };
    } else {
        const [spotPnlRows] = await db.execute(`
            SELECT 
                SUM(CASE WHEN accion = 'BUY'  THEN capital_usdt ELSE 0 END) as total_comprado,
                SUM(CASE WHEN accion = 'SELL' THEN capital_usdt ELSE 0 END) as total_vendido,
                COUNT(CASE WHEN accion = 'BUY'  THEN 1 END) as num_compras,
                COUNT(CASE WHEN accion = 'SELL' THEN 1 END) as num_ventas
            FROM spot_trades WHERE user_id = ?`, [userId]);
        const spRow = spotPnlRows[0] || {};
        const totalComprado  = parseFloat(spRow.total_comprado  || 0);
        const totalVendido   = parseFloat(spRow.total_vendido   || 0);
        const ethActual      = parseFloat(balSpot.eth || 0);
        const valorEthActual = ethActual * ethPrecioEst;
        const pnlRealizado   = totalVendido - totalComprado;
        const pnlTotal       = pnlRealizado + valorEthActual;

        spotPnl = {
            totalComprado:  totalComprado.toFixed(2),
            totalVendido:   totalVendido.toFixed(2),
            numCompras:     spRow.num_compras || 0,
            numVentas:      spRow.num_ventas  || 0,
            pnlRealizado:   pnlRealizado.toFixed(2),
            valorEthActual: valorEthActual.toFixed(2),
            pnlTotal:       pnlTotal.toFixed(2),
            ethActual:      ethActual.toFixed(6)
        };
    }

    // AI Futuros: ultima decision de ESTE usuario
    const [aiRowsFut] = await db.execute(
        `SELECT * FROM bot_decisions WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [userId]
    );
    const lastAIFut = aiRowsFut[0] || null;

    // AI Spot: ultima decision de ESTE usuario
    const [aiRowsSpot] = await db.execute(
        `SELECT * FROM spot_decisions WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [userId]
    );
    const lastAISpot = aiRowsSpot[0] || null;

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
            totalTrades: user.modo_real ? sTradesRaw.length : executedSpot
        },
        spotPnl,
        trades: allTrades,
        tradesFuturos,
        tradesSpot,
        aiFuturos: lastAIFut ? {
            accion:    (lastAIFut.confianza >= user.confianza_minima) ? lastAIFut.accion : 'HOLD / BLOQUEADO',
            razon:     lastAIFut.razon,
            confianza: lastAIFut.confianza,
            rsi:       lastAIFut.rsi || '--',
            hace:      Math.round((Date.now() - new Date(lastAIFut.fecha)) / 60000) + ' min'
        } : null,
        aiSpot: lastAISpot ? {
            accion:    (lastAISpot.confianza >= (user.confianza_minima_spot || user.confianza_minima)) ? lastAISpot.accion : 'HOLD / BLOQUEADO',
            razon:     lastAISpot.razon,
            confianza: lastAISpot.confianza,
            rsi:       lastAISpot.rsi || '--',
            hace:      Math.round((Date.now() - new Date(lastAISpot.fecha)) / 60000) + ' min'
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

// ═══════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════
function requireAdmin(req, res, next) {
    if (req.session && req.session.loggedIn && req.session.userRole === 'admin') return next();
    res.status(403).send('<h2 style="font-family:sans-serif;padding:2rem;color:red;">⛔ Acceso denegado. Solo administradores.</h2>');
}

app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
    const [users] = await db.execute('SELECT * FROM users ORDER BY id ASC');
    const msg = req.query.msg || '';

    const adminHTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin — WINTRADE</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #020617; color: #e2e8f0; min-height: 100vh; }
        .topbar { background: #0f172a; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; }
        .topbar h1 { font-size: 1.1rem; font-weight: 900; background: linear-gradient(90deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .topbar a { color: #64748b; font-size: 0.8rem; text-decoration: none; }
        .topbar a:hover { color: #e2e8f0; }
        .container { max-width: 1400px; margin: 2rem auto; padding: 0 1.5rem; }
        h2 { font-size: 1.4rem; font-weight: 900; margin-bottom: 1.5rem; color: #f8fafc; }
        .user-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 1.5rem; margin-bottom: 1.5rem; }
        .user-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 10px; }
        .user-name { font-size: 1.1rem; font-weight: 800; }
        .badge-role { font-size: 0.65rem; font-weight: 900; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; }
        .badge-admin { background: rgba(139,92,246,0.2); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }
        .badge-user  { background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.25); }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .field label { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
        .field input, .field select { background: #020617; border: 1px solid #1e293b; color: #e2e8f0; padding: 10px 14px; border-radius: 10px; font-size: 0.85rem; outline: none; width: 100%; }
        .field input:focus, .field select:focus { border-color: #3b82f6; }
        .field input[type="password"] { letter-spacing: 2px; }
        .btn-save { margin-top: 1.25rem; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; font-weight: 800; border: none; padding: 10px 26px; border-radius: 12px; cursor: pointer; font-size: 0.85rem; }
        .btn-save:hover { opacity: 0.85; }
        .btn-new { background: linear-gradient(135deg, #10b981, #3b82f6); color: white; font-weight: 800; border: none; padding: 12px 28px; border-radius: 14px; cursor: pointer; margin-bottom: 2rem; font-size: 0.9rem; }
        .success { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #34d399; padding: 12px 20px; border-radius: 12px; margin-bottom: 1.5rem; font-size: 0.85rem; font-weight: 700; }
        .separator { height: 1px; background: #1e293b; margin: 1rem 0; }
        .section-label { font-size: 0.65rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin: 1rem 0 0.75rem; }
        .toggle-wrap { display: flex; align-items: center; gap: 10px; margin-top: 0.5rem; }
        .toggle-wrap label { cursor: pointer; font-size: 0.8rem; font-weight: 700; }
    </style>
</head>
<body>
    <div class="topbar">
        <h1>⚙️ WINTRADE ADMIN</h1>
        <div style="display:flex;gap:20px;align-items:center;">
            <a href="/">← Dashboard</a>
            <a href="/logout">Cerrar sesión</a>
        </div>
    </div>
    <div class="container">
        <h2>Gestión de Usuarios y Configuración</h2>
        ${msg ? `<div class="success">✅ ${msg}</div>` : ''}

        <!-- NUEVO USUARIO -->
        <details style="background:#0f172a; border:1px solid #1e293b; border-radius:20px; padding:1.5rem; margin-bottom:1.5rem;">
            <summary style="cursor:pointer; font-weight:800; font-size:1rem;">➕ Crear nuevo usuario</summary>
            <form method="POST" action="/admin/user/new" style="margin-top:1.25rem;">
                <div class="form-grid">
                    <div class="field"><label>Nombre usuario</label><input name="nombre" required placeholder="ej: carlos123"></div>
                    <div class="field"><label>Contraseña</label><input type="text" name="password" required placeholder="contraseña123"></div>
                    <div class="field"><label>Rol</label>
                        <select name="role"><option value="user">user</option><option value="admin">admin</option></select>
                    </div>
                    <div class="field"><label>BingX API Key</label><input name="bingx_key" placeholder="API_KEY..."></div>
                    <div class="field"><label>BingX Secret</label><input name="bingx_secret" placeholder="SECRET..."></div>
                    <div class="field"><label>Apalancamiento (x)</label><input type="number" name="apalancamiento" value="10" min="1" max="125"></div>
                    <div class="field"><label>Riesgo por trade (%)</label><input type="number" name="riesgo_por_trade" value="2" step="0.1" min="0.1" max="100"></div>
                    <div class="field"><label>Pérdida máx diaria ($)</label><input type="number" name="perdida_maxima_diaria" value="10" step="0.5"></div>
                    <div class="field"><label>Confianza mínima IA (0-1)</label><input type="number" name="confianza_minima" value="0.75" step="0.05" min="0" max="1"></div>
                    <div class="field"><label>Modo Real</label>
                        <select name="modo_real"><option value="0">Simulado</option><option value="1">Real</option></select>
                    </div>
                </div>
                <button class="btn-save" type="submit">Crear Usuario</button>
            </form>
        </details>

        <!-- USUARIOS EXISTENTES -->
        ${users.map(u => `
        <div class="user-card">
            <div class="user-header">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div class="user-name">${u.nombre}</div>
                    <span class="badge-role ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span>
                    <span style="font-size:0.7rem; color:${u.activo ? '#34d399' : '#f87171'}; font-weight:700;">${u.activo ? '● Activo' : '● Inactivo'}</span>
                </div>
                <div style="font-size:0.75rem; color:#475569;">ID: ${u.id}</div>
            </div>
            <form method="POST" action="/admin/user/${u.id}/update">
                <div class="section-label">🔑 API Keys BingX</div>
                <div class="form-grid">
                    <div class="field"><label>API Key</label><input type="password" name="bingx_key" value="${u.bingx_key || ''}" placeholder="API_KEY..."></div>
                    <div class="field"><label>Secret Key</label><input type="password" name="bingx_secret" value="${u.bingx_secret || ''}" placeholder="SECRET..."></div>
                </div>
                <div class="separator"></div>
                <div class="section-label">⚙️ Configuración de Trading</div>
                <div class="form-grid">
                    <div class="field"><label>Apalancamiento (x)</label><input type="number" name="apalancamiento" value="${u.apalancamiento || 10}" min="1" max="125"></div>
                    <div class="field"><label>Riesgo por trade (%)</label><input type="number" name="riesgo_por_trade" value="${u.riesgo_por_trade || 2}" step="0.1" min="0.1" max="100"></div>
                    <div class="field"><label>Pérdida máx diaria ($)</label><input type="number" name="perdida_maxima_diaria" value="${u.perdida_maxima_diaria || 10}" step="0.5"></div>
                    <div class="field"><label>Confianza mínima IA (0-1)</label><input type="number" name="confianza_minima" value="${u.confianza_minima || 0.75}" step="0.05" min="0" max="1"></div>
                    <div class="field"><label>Modo</label>
                        <select name="modo_real">
                            <option value="0" ${!u.modo_real ? 'selected' : ''}>Simulado</option>
                            <option value="1" ${u.modo_real ? 'selected' : ''}>Real</option>
                        </select>
                    </div>
                    <div class="field"><label>Estado</label>
                        <select name="activo">
                            <option value="1" ${u.activo ? 'selected' : ''}>Activo</option>
                            <option value="0" ${!u.activo ? 'selected' : ''}>Inactivo</option>
                        </select>
                    </div>
                </div>
                <div class="separator"></div>
                <div class="section-label">🔐 Seguridad</div>
                <div class="form-grid">
                    <div class="field"><label>Nueva contraseña (dejar vacío = no cambiar)</label><input type="text" name="password" placeholder="nueva contraseña..."></div>
                    <div class="field"><label>Rol</label>
                        <select name="role">
                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                        </select>
                    </div>
                </div>
                <button class="btn-save" type="submit">💾 Guardar cambios de ${u.nombre}</button>
            </form>
        </div>
        `).join('')}
    </div>
</body>
</html>`;
    res.send(adminHTML);
});

// Actualizar usuario existente
app.post('/admin/user/:id/update', requireAuth, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { bingx_key, bingx_secret, apalancamiento, riesgo_por_trade, perdida_maxima_diaria, confianza_minima, modo_real, activo, password, role } = req.body;
    try {
        let query = `UPDATE users SET 
            bingx_key = ?, bingx_secret = ?, apalancamiento = ?, riesgo_por_trade = ?,
            perdida_maxima_diaria = ?, confianza_minima = ?, modo_real = ?, activo = ?, role = ?`;
        let values = [bingx_key, bingx_secret, apalancamiento, riesgo_por_trade, perdida_maxima_diaria, confianza_minima, modo_real, activo, role];
        if (password && password.trim() !== '') {
            query += `, password = ?`;
            values.push(password.trim());
        }
        query += ` WHERE id = ?`;
        values.push(id);
        await db.execute(query, values);
        res.redirect('/admin?msg=Usuario+actualizado+correctamente');
    } catch (e) {
        res.redirect(`/admin?msg=Error+al+guardar:+${e.message}`);
    }
});

// Crear nuevo usuario
app.post('/admin/user/new', requireAuth, requireAdmin, async (req, res) => {
    const { nombre, password, role, bingx_key, bingx_secret, apalancamiento, riesgo_por_trade, perdida_maxima_diaria, confianza_minima, modo_real } = req.body;
    try {
        await db.execute(
            `INSERT INTO users (nombre, password, role, bingx_key, bingx_secret, apalancamiento, riesgo_por_trade, perdida_maxima_diaria, confianza_minima, modo_real, activo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [nombre, password, role || 'user', bingx_key, bingx_secret, apalancamiento, riesgo_por_trade, perdida_maxima_diaria, confianza_minima, modo_real || 0]
        );
        res.redirect('/admin?msg=Usuario+creado+exitosamente');
    } catch (e) {
        res.redirect(`/admin?msg=Error+al+crear+usuario:+${e.message}`);
    }
});

// ═══════════════════════════════════════════
// PERFIL DE USUARIO (todos los usuarios)
// ═══════════════════════════════════════════
app.get('/perfil', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const u = rows[0];
    if (!u) return res.redirect('/logout');
    const msg = req.query.msg || '';

    const perfilHTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mi Perfil — WINTRADE</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: #020617; color: #e2e8f0; min-height: 100vh; }
        .topbar { background: #0f172a; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; }
        .topbar h1 { font-size: 1.1rem; font-weight: 900; background: linear-gradient(90deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .topbar a { color: #64748b; font-size: 0.8rem; text-decoration: none; margin-left: 20px; }
        .topbar a:hover { color: #e2e8f0; }
        .container { max-width: 900px; margin: 2.5rem auto; padding: 0 1.5rem; }
        h2 { font-size: 1.4rem; font-weight: 900; margin-bottom: 0.5rem; }
        .subtitle { font-size: 0.8rem; color: #64748b; margin-bottom: 2rem; }
        .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 2rem; margin-bottom: 1.5rem; }
        .section-label { font-size: 0.65rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-bottom: 1rem; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .field label { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
        .field input { background: #020617; border: 1px solid #1e293b; color: #e2e8f0; padding: 12px 14px; border-radius: 10px; font-size: 0.85rem; outline: none; width: 100%; }
        .field input:focus { border-color: #3b82f6; }
        .separator { height: 1px; background: #1e293b; margin: 1.5rem 0; }
        .btn-save { margin-top: 1.5rem; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; font-weight: 800; border: none; padding: 12px 32px; border-radius: 12px; cursor: pointer; font-size: 0.9rem; width: 100%; }
        .btn-save:hover { opacity: 0.85; }
        .success { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #34d399; padding: 12px 20px; border-radius: 12px; margin-bottom: 1.5rem; font-size: 0.85rem; font-weight: 700; }
        .restrict-note { font-size: 0.75rem; color: #475569; margin-top: 1rem; padding: 10px 16px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid #1e293b; }
        .user-badge { display: inline-flex; align-items: center; gap: 8px; background: #1e293b; padding: 8px 16px; border-radius: 20px; margin-bottom: 2rem; font-size: 0.8rem; font-weight: 800; }
    </style>
</head>
<body>
    <div class="topbar">
        <h1>👤 Mi Perfil</h1>
        <div>
            <a href="/">← Dashboard</a>
            <a href="/logout">Cerrar sesión</a>
        </div>
    </div>
    <div class="container">
        <div class="user-badge">
            ${u.nombre} 
            <span style="font-size:0.65rem;color:#64748b;font-weight:600;">ID: ${u.id} • ${u.role}</span>
        </div>
        <h2>Mi Configuración</h2>
        <p class="subtitle">Puedes actualizar tus API keys, parámetros de trading y contraseña.</p>

        ${msg ? `<div class="success">✅ ${msg}</div>` : ''}

        <form method="POST" action="/perfil/update">
            <div class="card">
                <div class="section-label">🔑 API Keys BingX</div>
                <div class="form-grid">
                    <div class="field"><label>API Key</label><input type="password" name="bingx_key" value="${u.bingx_key || ''}" placeholder="Tu API Key de BingX"></div>
                    <div class="field"><label>Secret Key</label><input type="password" name="bingx_secret" value="${u.bingx_secret || ''}" placeholder="Tu Secret Key de BingX"></div>
                </div>
            </div>

            <div class="card">
                <div class="section-label">⚙️ Parámetros de Trading</div>
                <div class="form-grid">
                    <div class="field">
                        <label>Apalancamiento (x)</label>
                        <input type="number" name="apalancamiento" value="${u.apalancamiento || 10}" min="1" max="125">
                    </div>
                    <div class="field">
                        <label>Riesgo por trade (%)</label>
                        <input type="number" name="riesgo_por_trade" value="${u.riesgo_por_trade || 2}" step="0.1" min="0.1" max="100">
                    </div>
                    <div class="field">
                        <label>Pérdida máx diaria ($)</label>
                        <input type="number" name="perdida_maxima_diaria" value="${u.perdida_maxima_diaria || 10}" step="0.5" min="1">
                    </div>
                    <div class="field">
                        <label>Confianza mín. Futuros (0-1)</label>
                        <input type="number" name="confianza_minima" value="${u.confianza_minima || 0.70}" step="0.01" min="0.5" max="1">
                    </div>
                    <div class="field">
                        <label>Confianza mín. Spot (0-1)</label>
                        <input type="number" name="confianza_minima_spot" value="${u.confianza_minima_spot || 0.65}" step="0.01" min="0.5" max="1">
                    </div>
                </div>
                <div class="restrict-note">
                    🔒 El modo (Real/Simulado), estado de cuenta y rol solo puede cambiarlos el administrador.
                </div>
            </div>

            <div class="card">
                <div class="section-label">🔐 Cambiar Contraseña</div>
                <div class="form-grid">
                    <div class="field">
                        <label>Nueva contraseña (dejar vacío = no cambiar)</label>
                        <input type="text" name="password" placeholder="nueva contraseña...">
                    </div>
                </div>
            </div>

            <button class="btn-save" type="submit">💾 Guardar mis cambios</button>
        </form>
    </div>
</body>
</html>`;
    res.send(perfilHTML);
});

app.post('/perfil/update', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const { bingx_key, bingx_secret, apalancamiento, riesgo_por_trade, perdida_maxima_diaria, confianza_minima, confianza_minima_spot, password } = req.body;
    try {
        // Solo campos permitidos para user — NO modo_real, activo, role
        let query = `UPDATE users SET 
            bingx_key = ?, bingx_secret = ?, apalancamiento = ?, 
            riesgo_por_trade = ?, perdida_maxima_diaria = ?, confianza_minima = ?, confianza_minima_spot = ?`;
        let values = [bingx_key, bingx_secret, apalancamiento, riesgo_por_trade, perdida_maxima_diaria, confianza_minima, confianza_minima_spot];
        if (password && password.trim() !== '') {
            query += `, password = ?`;
            values.push(password.trim());
        }
        query += ` WHERE id = ?`;
        values.push(userId);
        await db.execute(query, values);
        res.redirect('/perfil?msg=Configuración+actualizada+correctamente');
    } catch (e) {
        res.redirect(`/perfil?msg=Error+al+guardar:+${e.message}`);
    }
});

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
