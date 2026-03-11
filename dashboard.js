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

    <!-- IA SECCION COMPLETA: FUTUROS + SPOT EN PARALELO -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:2rem;">

        <!-- IA FUTUROS -->
        <div class="card" style="border:1px solid rgba(99,102,241,0.35);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-size:0.65rem; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; color:var(--secondary); margin-bottom:6px;">IA FUTUROS (BTC)</div>
                    ${data.aiFuturos ? `<span class="badge ${data.aiFuturos.accion === 'LONG' ? 'b-long' : data.aiFuturos.accion === 'SHORT' ? 'b-short' : 'b-spot'}" style="font-size:1rem; padding:10px 22px;">${data.aiFuturos.accion}</span>` : ''}
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
                    ${data.aiSpot ? `<span class="badge ${data.aiSpot.accion === 'BUY' ? 'b-long' : data.aiSpot.accion === 'SELL' ? 'b-short' : 'b-spot'}" style="font-size:1rem; padding:10px 22px;">${data.aiSpot.accion}</span>` : ''}
                </div>
                ${data.aiSpot ? `
                <div style="text-align:right;">
                    <div style="font-size:0.6rem; color:var(--text-dim); font-weight:800;">CONFIANZA</div>
                    <div style="font-size:1.8rem; font-weight:900; color:var(--success); line-height:1;">${Math.round(data.aiSpot.confianza * 100)}%</div>
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
            
            ${data.chart.data.length >= 2 ? `
            <div class="card" style="padding-bottom:1.25rem;">
                <div class="card-header">
                    <div class="card-title">Rendimiento Acumulado</div>
                </div>
                <div style="height:240px;"><canvas id="mainChart"></canvas></div>
            </div>
            ` : ''}

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
                                <tr><th>Operación</th><th>Precio</th><th>Margen</th><th>Hora</th></tr>
                            </thead>
                            <tbody>
                                ${data.tradesFuturos.length > 0 ? data.tradesFuturos.map(t => `
                                    <tr>
                                        <td><span class="badge ${t.accion === 'LONG' ? 'b-long' : 'b-short'}">${t.accion}</span></td>
                                        <td><b>$${t.precio}</b></td>
                                        <td>${t.detalle}</td>
                                        <td style="color:var(--text-dim); font-size:0.7rem;">${t.hora}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-dim);">Sin operaciones</td></tr>'}
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

        <!-- RIGHT COLUMN: INSIGHTS & UTILS -->
        <div style="display:flex; flex-direction:column; gap:1.5rem;">

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

    const [balFut, balSpot, ethPrecioReal] = await Promise.all([
        traderFuturos.getBalance(user).catch(() => 0),
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
    const [fTradesRaw] = await db.execute(`SELECT 'FUTURES' as bot, direccion as accion, precio_entrada as precio, capital_usado as margen, resultado, ganancia_perdida as pnl, timestamp_apertura as hora FROM bot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 20`);
    const [sTradesRaw] = await db.execute(`SELECT 'SPOT' as bot, accion, precio_entrada as precio, capital_usdt as monto_usdt, 'FINALIZADO' as resultado, 0 as pnl, timestamp_apertura as hora FROM spot_trades WHERE ${tf} ORDER BY hora DESC LIMIT 20`);

    const fmt = (d) => new Date(d).toLocaleString('es-SV', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
    const fmtUSDT = (v) => parseFloat(v || 0) > 0 ? `$${parseFloat(v).toFixed(2)} USDT` : '--';

    // Build separate formatted arrays BEFORE merging (avoid double-format bug)
    const tradesFuturos = fTradesRaw.map(t => ({
        accion: t.accion,
        precio: parseFloat(t.precio).toFixed(2),
        detalle: fmtUSDT(t.margen),
        hora: fmt(t.hora)
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

    // Charting
    const [pnlRows] = await db.execute(`SELECT DATE_FORMAT(timestamp_cierre, '%d/%m %H:00') as x, SUM(ganancia_perdida) as y FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL GROUP BY x ORDER BY MIN(timestamp_cierre) ASC LIMIT 50`, [userId]);
    let ac = 0;
    const chart = { labels: pnlRows.map(r=>r.x), data: pnlRows.map(r=>(ac+=parseFloat(r.y)).toFixed(2)) };

    // Performance List
    const [dailyRows] = await db.execute(`SELECT DATE_FORMAT(timestamp_cierre, '%Y-%m-%d') as fecha, SUM(ganancia_perdida) as pnl, COUNT(*) as total FROM bot_trades WHERE user_id = ? AND timestamp_cierre IS NOT NULL GROUP BY fecha ORDER BY fecha DESC LIMIT 10`, [userId]);

    const executedFuturos = fExecuted[0].executed || 0;
    const executedSpot   = sStats[0].total || 0;

    // Spot PnL: algoritmo compra-venta
    const [spotPnlRows] = await db.execute(`
        SELECT 
            SUM(CASE WHEN accion = 'BUY'  THEN capital_usdt ELSE 0 END) as total_comprado,
            SUM(CASE WHEN accion = 'SELL' THEN capital_usdt ELSE 0 END) as total_vendido,
            COUNT(CASE WHEN accion = 'BUY'  THEN 1 END) as num_compras,
            COUNT(CASE WHEN accion = 'SELL' THEN 1 END) as num_ventas
        FROM spot_trades WHERE user_id = ?`, [userId]);
    const spRow = spotPnlRows[0] || {};
    // ethPrecioEst ya viene del API real (definido arriba)
    const totalComprado  = parseFloat(spRow.total_comprado  || 0);
    const totalVendido   = parseFloat(spRow.total_vendido   || 0);
    const ethActual      = parseFloat(balSpot.eth || 0);
    const valorEthActual = ethActual * ethPrecioEst;
    const pnlRealizado   = totalVendido - totalComprado;
    const pnlTotal       = pnlRealizado + valorEthActual; // incluye ETH sin vender
    const spotPnl = {
        totalComprado:  totalComprado.toFixed(2),
        totalVendido:   totalVendido.toFixed(2),
        numCompras:     spRow.num_compras || 0,
        numVentas:      spRow.num_ventas  || 0,
        pnlRealizado:   pnlRealizado.toFixed(2),
        valorEthActual: valorEthActual.toFixed(2),
        pnlTotal:       pnlTotal.toFixed(2),
        ethActual:      ethActual.toFixed(6)
    };

    // AI Futuros: siempre la ultima decision
    const [aiRowsFut] = await db.execute(
        `SELECT * FROM bot_decisions ORDER BY id DESC LIMIT 1`
    );
    const lastAIFut = aiRowsFut[0] || null;

    // AI Spot: siempre la ultima decision
    const [aiRowsSpot] = await db.execute(
        `SELECT * FROM spot_decisions ORDER BY id DESC LIMIT 1`
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
            totalTrades: executedSpot
        },
        spotPnl,
        trades: allTrades,
        tradesFuturos,
        tradesSpot,
        aiFuturos: lastAIFut ? {
            accion:    lastAIFut.accion,
            razon:     lastAIFut.razon,
            confianza: lastAIFut.confianza,
            rsi:       lastAIFut.rsi || '--',
            hace:      Math.round((Date.now() - new Date(lastAIFut.fecha)) / 60000) + ' min'
        } : null,
        aiSpot: lastAISpot ? {
            accion:    lastAISpot.accion,
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
