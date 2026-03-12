const fs = require('fs');
let content = fs.readFileSync('dashboard.js', 'utf8');

// Update getDashboardData signature and add dateFilter variables
content = content.replace('async function getDashboardData() {',
`async function getDashboardData(period = 'today') {
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
    }`);

content = content.replace(/WHERE DATE\(timestamp_apertura\) = CURDATE\(\)/g, 'WHERE ${dfFut}');
content = content.replace(/FROM spot_trades WHERE \$\{dfFut\}/g, 'FROM spot_trades WHERE ${dfSpot}');
content = content.replace(/FROM bot_decisions WHERE DATE\(timestamp\) = CURDATE\(\)/g, 'FROM bot_decisions WHERE ${dfDecFut}');
content = content.replace(/FROM spot_decisions WHERE DATE\(fecha\) = CURDATE\(\)/g, 'FROM spot_decisions WHERE ${dfDecSpot}');

content = content.replace('const dashboardHTML = (data) => `', 'const dashboardHTML = (data, period) => `');
content = content.replace(/ Trades Hoy/g, ' Trades (Rango)');
content = content.replace(/>hoy</g, '>rango<');
content = content.replace(/ hoy/g, ' Rango');
content = content.replace(/ Hoy/g, ' Rango');

const headerRightLoc = '<div class="header-right">';
const dropdownHTML = `
      <select id="periodFilter" onchange="window.location.href='/?period='+this.value" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 0.8rem; background: var(--bg); cursor: pointer; outline: none; margin-right: 15px;">
        <option value="today" \${period === 'today' ? 'selected' : ''}>Hoy</option>
        <option value="7days" \${period === '7days' ? 'selected' : ''}>Últimos 7 Días</option>
        <option value="30days" \${period === '30days' ? 'selected' : ''}>Últimos 30 Días</option>
        <option value="all" \${period === 'all' ? 'selected' : ''}>Desde el inicio</option>
      </select>`;
content = content.replace(headerRightLoc, headerRightLoc + dropdownHTML);

content = content.replace("app.get('/', requireAuth, async (req, res) => {\\n    const data = await getDashboardData();\\n    res.send(dashboardHTML(data));\\n});", 
`app.get('/', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const data = await getDashboardData(period);
    res.send(dashboardHTML(data, period));
});`);

content = content.replace("app.get('/api/data', requireAuth, async (req, res) => {\\n    const data = await getDashboardData();\\n    res.json(data);\\n});", 
`app.get('/api/data', requireAuth, async (req, res) => {
    const period = req.query.period || 'today';
    const data = await getDashboardData(period);
    res.json(data);
});`);

fs.writeFileSync('dashboard.js', content);
console.log('Patch complete.');
