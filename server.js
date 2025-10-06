// server.js — static site only. No OAuth here.
const express = require("express");
const path = require("path");

const { PORT = 8080 } = process.env;
const app = express();

app.disable("x-powered-by");

// Serve everything from repo root
app.use(express.static(path.resolve("."), {
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));

// Healthcheck
app.get("/health", (_req, res) => res.type("text").send("ok"));

// 404 for anything not found (keeps /api/* clearly absent on this service)
app.use((req, res) => {
  res.status(404).type("text").send(
    "404 Not Found\nThis service hosts static pages only. " +
    "OAuth lives on the bot service."
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`static site listening on 0.0.0.0:${PORT}`);
});
