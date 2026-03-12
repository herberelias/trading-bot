const fs = require('fs');
const html = fs.readFileSync('dashboard.js', 'utf8');
const p1 = html.indexOf("app.get('/', async (req, res) => {");
const content = html.substring(p1);
fs.writeFileSync('dashboard_html.txt', content);
