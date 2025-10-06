// Minimal API for Discord OAuth, guilds, and Firebase-backed bot config.
// Supports three ways to supply the Firebase service key, in this order:
// 1) FIREBASE_SERVICE_ACCOUNT_JSON  (entire JSON string)
// 2) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
// 3) ./kadie-ai/firebase/serviceAccount.json  (drop-in file)

const express = require("express");
const session = require("express-session");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");

// ----- ENV -----
const {
  PORT = 8080,
  SESSION_SECRET = "change-me",

  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI, // e.g. https://yourdomain.com/api/callback

  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY, // keep \n newlines escaped
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  console.error("Missing Discord OAuth env. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI.");
}

const app = express();
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: "lax", httpOnly: true, secure: false }
}));

// ----- Firebase Admin init (central store) -----
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

// Firestore helpers: prefer path guilds/{id}/configs/app; keep legacy fallback.
async function readGuildConfig(guildId){
  if (db) {
    // new path
    const docRef = db.collection("guilds").doc(guildId).collection("configs").doc("app");
    const snap = await docRef.get();
    if (snap.exists) return snap.data();

    // legacy fallback
    const legacy = await db.collection("guild_configs").doc(guildId).get();
    return legacy.exists ? legacy.data() : null;
  }
  return memoryStore.get(guildId) ?? null;
}

async function writeGuildConfig(guildId, doc){
  if (db) {
    await db.collection("guilds").doc(guildId).collection("configs").doc("app").set(doc, { merge: true });
    // also write legacy for compatibility
    await db.collection("guild_configs").doc(guildId).set(doc, { merge: true });
    return;
  }
  memoryStore.set(guildId, doc);
}

// ----- Static site -----
app.use(express.static(path.resolve(".")));

// ----- Discord OAuth -----
const DISCORD_OAUTH_AUTHORIZE = "https://discord.com/api/oauth2/authorize";
const DISCORD_OAUTH_TOKEN = "https://discord.com/api/oauth2/token";
const DISCORD_API = "https://discord.com/api";

function requireAuth(req, res, next){
  if (!req.session.discord) return res.status(401).json({ error: "unauthenticated" });
  next();
}

app.get("/api/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds"
  });
  res.redirect(`${DISCORD_OAUTH_AUTHORIZE}?${params.toString()}`);
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

  const r = await fetch(DISCORD_OAUTH_TOKEN, {
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

  res.redirect("/kadie-ai/");
});

app.get("/api/logout", (req, res) => {
  req.session.destroy(()=>res.redirect("/kadie-ai/"));
});

async function authFetch(req, pathSuffix){
  const { access_token } = req.session.discord;
  return fetch(`${DISCORD_API}${pathSuffix}`, { headers: { Authorization: `Bearer ${access_token}` } });
}

// ----- Me / Guilds -----
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

// ----- Permission check -----
const PERM_ADMIN = 8n;
const PERM_MANAGE_GUILD = 32n;

async function ensureManageable(req, guildId){
  const r = await authFetch(req, "/users/@me/guilds");
  if (!r.ok) throw new Error("guilds fetch failed");
  const guilds = await r.json();
  const g = guilds.find(x=>x.id === guildId);
  if (!g) throw new Error("not in guild");
  const perms = BigInt(g.permissions ?? "0");
  const manageable = g.owner || (perms & PERM_ADMIN) !== 0n || (perms & PERM_MANAGE_GUILD) !== 0n;
  if (!manageable) throw new Error("insufficient permissions");
}

// ----- Config API (dynamic) -----
app.get("/api/config", requireAuth, async (req, res) => {
  const guildId = req.query.guild_id;
  if (!guildId) return res.status(400).json({ error: "guild_id required" });
  try {
    await ensureManageable(req, guildId);
    const cfg = await readGuildConfig(guildId);
    return res.json(cfg ?? null);
  } catch (e) {
    return res.status(403).json({ error: e.message });
  }
});

app.post("/api/config", requireAuth, async (req, res) => {
  const guildId = req.query.guild_id;
  if (!guildId) return res.status(400).json({ error: "guild_id required" });
  try {
    await ensureManageable(req, guildId);
    const doc = req.body && typeof req.body === "object" ? req.body : {};
    doc.updatedAt = new Date().toISOString();
    await writeGuildConfig(guildId, doc);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(403).json({ error: e.message });
  }
});

// ----- Start -----
app.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${PORT}`);
});
