// 미리보기용 작은 서버(화면만, /api 없음)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(root, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('{}'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'text/plain' }); res.end(d); });
}).listen(5173);
