// Minimal site + Discord OAuth2 + config API.
// After OAuth, redirects to /kadie-ai/bot-config.html.

const express = require("express");
const session = require("express-session");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");

// ---------- ENV ----------
const {
  PORT = 8080,
  SESSION_SECRET = "change-me",

  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  // For local dev set to: http://localhost:8080/api/callback
  DISCORD_REDIRECT_URI,

  // Optional Firebase Admin creds; if absent, uses in-memory store.
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY, // keep \n escaped
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  console.error("Missing Discord OAuth env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI");
}

const app = express();
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: "lax", httpOnly: true, secure: false }
}));

// ---------- Firebase Admin (optional) ----------
let db = null;
const memoryStore = new Map();

(function initFirebase(){
  try {
    const admin = require("firebase-admin");
    let creds = null;

    if (FIREBASE_SERVICE_ACCOUNT_JSON) {
      creds = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
      creds = {
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      };
    } else {
      const localKeyPath = path.resolve("./kadie-ai/firebase/serviceAccount.json");
      if (fs.existsSync(localKeyPath)) {
        creds = JSON.parse(fs.readFileSync(localKeyPath, "utf8"));
      }
    }

    if (creds) {
      admin.initializeApp({ credential: admin.credential.cert(creds) });
      db = admin.firestore();
      console.log("Firebase Admin initialized");
    } else {
      console.warn("Firebase credentials not provided. Using in-memory config store.");
    }
  } catch (e) {
    console.warn("Firebase Admin not available. Using in-memory store. " + e.message);
  }
})();

async function readGuildConfig(guildId){
  if (db) {
    const docRef = db.collection("guilds").doc(guildId).collection("configs").doc("app");
    const snap = await docRef.get();
    if (snap.exists) return snap.data();
    const legacy = await db.collection("guild_configs").doc(guildId).get();
    return legacy.exists ? legacy.data() : null;
  }
  return memoryStore.get(guildId) ?? null;
}

async function writeGuildConfig(guildId, doc){
  if (db) {
    await db.collection("guilds").doc(guildId).collection("configs").doc("app").set(doc, { merge: true });
    await db.collection("guild_configs").doc(guildId).set(doc, { merge: true }); // legacy mirror
    return;
  }
  memoryStore.set(guildId, doc);
}

// ---------- Static ----------
app.use(express.static(path.resolve(".")));

// Hard redirect old paths to the new file name.
app.get(["/kadie-ai", "/kadie-ai/", "/kadie-ai/index.html"], (req, res) =>
  res.redirect(301, "/kadie-ai/kadie-ai.html")
);

// ---------- Discord OAuth ----------
const OAUTH_AUTHORIZE = "https://discord.com/api/oauth2/authorize";
const OAUTH_TOKEN = "https://discord.com/api/oauth2/token";
const DISCORD_API = "https://discord.com/api";

function requireAuth(req, res, next){
  if (!req.session.discord) return res.status(401).json({ error: "unauthenticated" });
  next();
}

app.get("/api/login", (_req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds"
  });
  res.redirect(`${OAUTH_AUTHORIZE}?${params.toString()}`);
});

app.get("/api/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code.");

  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
  });

  const r = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) return res.status(500).send("Token exchange failed.");

  const token = await r.json();
  req.session.discord = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000
  };

  // Go straight to config after sign-in.
  res.redirect("/kadie-ai/bot-config.html");
});

app.get("/api/logout", (req, res) => {
  req.session.destroy(()=>res.redirect("/kadie-ai/kadie-ai.html"));
});

async function authFetch(req, suffix){
  const { access_token } = req.session.discord;
  return fetch(`${DISCORD_API}${suffix}`, { headers: { Authorization: `Bearer ${access_token}` } });
}

app.get("/api/me", requireAuth, async (req, res) => {
  const r = await authFetch(req, "/users/@me");
  if (!r.ok) return res.status(r.status).send(await r.text());
  res.json(await r.json());
});

app.get("/api/guilds", requireAuth, async (req, res) => {
  const r = await authFetch(req, "/users/@me/guilds");
  if (!r.ok) return res.status(r.status).send(await r.text());
  res.json(await r.json());
});

// Config endpoints
app.get("/api/config", requireAuth, async (req, res) => {
  const guildId = req.query.guild_id;
  if (!guildId) return res.status(400).json({ error: "guild_id required" });
  const cfg = await readGuildConfig(guildId);
  res.json(cfg ?? null);
});

app.post("/api/config", requireAuth, async (req, res) => {
  const guildId = req.query.guild_id;
  if (!guildId) return res.status(400).json({ error: "guild_id required" });
  const doc = req.body && typeof req.body === "object" ? req.body : {};
  doc.updatedAt = new Date().toISOString();
  await writeGuildConfig(guildId, doc);
  res.json({ ok: true });
});

// ---------- Start ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${PORT}`);
});
