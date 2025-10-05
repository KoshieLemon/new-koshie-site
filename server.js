const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 8080);

function pickStaticDir() {
  const candidates = [
    process.env.STATIC_DIR, // set this in Railway if your assets live elsewhere, e.g. "client/dist"
    'dist', 'build', 'public', 'out', 'site', 'www', 'static'
  ].filter(Boolean);

  for (const rel of candidates) {
    const abs = path.resolve(__dirname, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
  }
  if (fs.existsSync(path.join(__dirname, 'index.html'))) return __dirname;
  return null;
}

const STATIC_DIR = pickStaticDir();
if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR));
  app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));
  const indexPath = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    app.get('*', (_req, res) => res.sendFile(indexPath));
  } else {
    app.get('*', (_req, res) => res.type('text/plain').send('static server up'));
  }
} else {
  app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));
  app.get('*', (_req, res) => res.type('text/plain').send('server up: no static content found'));
}

app.listen(PORT, HOST, () => {
  console.log(`listening on ${HOST}:${PORT} serving ${STATIC_DIR || 'none'}`);
});
