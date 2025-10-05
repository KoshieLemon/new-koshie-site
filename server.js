const express = require('express');
const path = require('path');
const app = express();

// Railway automatically sets PORT
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint
app.get('/healthz', (req, res) => res.send('ok'));

// Fallback for SPAs (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
