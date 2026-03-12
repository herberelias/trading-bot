const fs = require('fs');
let content = fs.readFileSync('dashboard.js', 'utf8');

// 1. CHART JS Logic
const chartJsLogic = `// Countdown
let secs = 60;
setInterval(() => {
  secs--;
  const el = document.getElementById('countdown');
  if (el) el.textContent = secs;
  if (secs <= 0) location.reload();
}, 1000);

// --- CHARTS INITIALIZATION ---
// Inject data safely
const chartData = \${JSON.stringify(data.charts)};

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
}`;

content = content.replace(/\/\/ Countdown[\s\S]*?secs <= 0\) location.reload\(\);[\s\S]*?}, 1000\);/g, chartJsLogic);

// 2. Ensure Routes are updated
content = content.replace(/app\.get\('\/', requireAuth, async \(req, res\) => {[\s\S]*?const data = await getDashboardData\(\);[\s\S]*?res\.send\(dashboardHTML\(data\)\);[\s\S]*?\}\);/g, 
`app.get('/', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const data = await getDashboardData(period);
    res.send(dashboardHTML(data, period));
});`);

content = content.replace(/app\.get\('\/api\/data', requireAuth, async \(req, res\) => {[\s\S]*?const data = await getDashboardData\(\);[\s\S]*?res\.json\(data\);[\s\S]*?\}\);/g, 
`app.get('/api/data', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const data = await getDashboardData(period);
    res.json(data);
});`);

fs.writeFileSync('dashboard.js', content);
console.log('Patch V2 complete.');
