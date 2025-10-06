// server.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

const PUBLIC_DIR = path.join(__dirname); // serve the folder containing index.html

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] })); // enables /kadie-ai -> kadie-ai.html

// SPA/history fallback: always return index.html for unknown routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`listening on http://localhost:${PORT}`);
});
