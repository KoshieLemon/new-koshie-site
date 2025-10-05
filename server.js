const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const RAILWAY_PORT = process.env.PORT;
const PORT = Number(RAILWAY_PORT || 8080);
const HOST = '0.0.0.0';

// choose static dir: /dist then /build
const distDir = path.join(__dirname, 'dist');
const buildDir = path.join(__dirname, 'build');
const STATIC_DIR = fs.existsSync(distDir) ? distDir : (fs.existsSync(buildDir) ? buildDir : null);

if (!STATIC_DIR) {
  console.error('ERROR: no /dist or /build found in project root.');
  process.exit(1);
}

app.use(express.static(STATIC_DIR));

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`listening on ${HOST}:${PORT} (RAILWAY_PORT=${RAILWAY_PORT || 'unset'}) serving ${STATIC_DIR}`);
});
