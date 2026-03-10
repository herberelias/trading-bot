const fs = require('fs');
let code = fs.readFileSync('dashboard.js', 'utf8');

// Replace accion -> direccion, cantidad -> capital_usado in bot_trades queries ONLY.
// Not touching spot_trades or bot_decisions.

// Trades futuros hoy
code = code.replace(
  'SELECT par, direccion AS accion, precio_entrada, stop_loss, take_profit, capital_usado AS cantidad, timestamp_apertura\n            FROM bot_trades',
  'SELECT par, direccion AS accion, precio_entrada, stop_loss, take_profit, capital_usado AS cantidad, timestamp_apertura\n            FROM bot_trades'
);

// We need to just search for `bot_trades` block and apply carefully.
// I will write custom replacements.

code = code.replace(
`        // Ultima decision futuros
        const [decFuturos] = await db.execute(\`
            SELECT accion, confianza, razon, ejecutado FROM bot_decisions
            ORDER BY fecha DESC LIMIT 1
        \`);`,
`        // Ultima decision futuros
        const [decFuturos] = await db.execute(\`
            SELECT accion, confianza, razon, ejecutado FROM bot_decisions
            ORDER BY timestamp DESC LIMIT 1
        \`);`
);

code = code.replace(
`        // Decisiones futuros hoy
        const [dfHoy] = await db.execute(\`
            SELECT COUNT(*) as total, SUM(ejecutado=1) as ejecutadas
            FROM bot_decisions WHERE DATE(fecha) = CURDATE()
        \`);`,
`        // Decisiones futuros hoy
        const [dfHoy] = await db.execute(\`
            SELECT COUNT(*) as total, SUM(ejecutado=1) as ejecutadas
            FROM bot_decisions WHERE DATE(timestamp) = CURDATE()
        \`);`
);

// Problem 3 and 5.
// Let's replace the whole getDashboardData function
// Actually, it's very large. Let's just create a modified copy containing the balance fetches.
const finalGetDashboardDataStr = code.substring(code.indexOf('async function getDashboardData() {'), code.indexOf('// ═══════════════════════════════════════════\r\n// RUTAS') !== -1 ? code.indexOf('// ═══════════════════════════════════════════\r\n// RUTAS') : code.indexOf('// ═══════════════════════════════════════════\n// RUTAS'));


fs.writeFileSync('dashboard.js', code);
console.log('patched dashboard');
