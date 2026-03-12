const fs = require('fs');
let c = fs.readFileSync('dashboard.js', 'utf8');

c = c.replace(/color:#fff/g, 'color:var(--text)');
c = c.replace(/onclick="showTab\('resumen'\)"/g, 'onclick="showTab(\'resumen\', this)"');
c = c.replace(/onclick="showTab\('futuros'\)"/g, 'onclick="showTab(\'futuros\', this)"');
c = c.replace(/onclick="showTab\('spot'\)"/g, 'onclick="showTab(\'spot\', this)"');
c = c.replace(/onclick="showTab\('estadisticas'\)"/g, 'onclick="showTab(\'estadisticas\', this)"');

c = c.replace(
  `function showTab(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}`,
  `function showTab(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if(btn) btn.classList.add('active');
}`
);

fs.writeFileSync('dashboard.js', c);
console.log('UI tabs patched');
