const fs = require('fs');

let c = fs.readFileSync('dashboard.js','utf8');
c = c.replace(
  '<div class="stat-item"><span class="stat-key">Decisiones totales hoy</span><span class="stat-val">${data.statsFuturos.decisiones}</span></div>',
  '<div class="stat-item"><span class="stat-key">Total (Histórico Cerrados)</span><span class="stat-val">${data.statsFuturos.tradesCerrados}</span></div>\\n      <div class="stat-item"><span class="stat-key">Trades ganadores</span><span class="stat-val text-green">${data.statsFuturos.ganados}</span></div>'
);

c = c.replace(
  '<div class="stat-item"><span class="stat-key">HOLD / Bloqueados</span><span class="stat-val text-muted">${data.statsFuturos.holds}</span></div>',
  '<div class="stat-item"><span class="stat-key">Trades perdedores</span><span class="stat-val text-red">${data.statsFuturos.perdidos}</span></div>'
);

c = c.replace(
  '<div class="stat-item"><span class="stat-key">Tasa de ejecución</span><span class="stat-val">${data.statsFuturos.tasaEjecucion}%</span></div>',
  '<div class="stat-item" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><span class="stat-key" style="font-weight:600;color:#fff">PnL Total Acumulado</span><span class="stat-val ${parseFloat(data.statsFuturos.pnlTotal)>=0?\'text-green\':\'text-red\'}" style="font-weight:600;font-size:1.1rem">${data.statsFuturos.pnlTotal} USDT</span></div>\\n      <div class="stat-item"><span class="stat-key">Tasa de ejecución (IA vs Ejecutadas)</span><span class="stat-val">${data.statsFuturos.tasaEjecucion}%</span></div>'
);

fs.writeFileSync('dashboard.js', c);
console.log('UI patch complete');
