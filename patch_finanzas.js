const fs = require('fs');
let content = fs.readFileSync('dashboard.js', 'utf8');

const oldTabs = `<div class="tabs">
    <button class="tab active" onclick="showTab('resumen', this)">Resumen</button>
    <button class="tab" onclick="showTab('futuros', this)">Futuros BTC</button>
    <button class="tab" onclick="showTab('spot', this)">Spot ETH</button>
    <button class="tab" onclick="showTab('estadisticas', this)">Estadísticas</button>
  </div>`;

const newTabs = `<div class="tabs">
    <button class="tab active" onclick="showTab('resumen', this)">Resumen</button>
    <button class="tab" onclick="showTab('futuros', this)">Futuros BTC</button>
    <button class="tab" onclick="showTab('spot', this)">Spot ETH</button>
    <button class="tab" onclick="showTab('estadisticas', this)">Estadísticas</button>
    <button class="tab" onclick="showTab('finanzas', this)">Finanzas</button>
  </div>`;

if (content.indexOf(oldTabs) === -1) {
    console.log('Tabs not found with direct match, trying line by line...');
    // Fallback simple
    content = content.replace("onclick=\"showTab('estadisticas', this)\">Estadísticas</button>", "onclick=\"showTab('estadisticas', this)\">Estadísticas</button>\n    <button class=\"tab\" onclick=\"showTab('finanzas', this)\">Finanzas</button>");
} else {
    content = content.replace(oldTabs, newTabs);
}

fs.writeFileSync('dashboard.js', content);
console.log('Patch Financial Tabs complete.');
