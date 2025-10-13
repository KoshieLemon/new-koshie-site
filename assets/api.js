// /assets/api.js
// OAuth-aware site helpers with LOCAL/PROD return-to and verbose diagnostics.
// Version: api.js v6

// ---------- Config ----------
export const NODE_API_BASE = 'https://api.koshiestudios.com';

// Detect local vs prod from the page you're on.
export const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// Always prefer explicit localhost:8080 during dev.
const LOCAL_ORIGIN = 'http://localhost:8080';

// Where should pages return after OAuth?
export const SITE_ORIGIN = IS_LOCAL ? LOCAL_ORIGIN : location.origin;

// Compute a stable "return to here" URL, preserving path + query.
function computeReturnTo() {
  // Allow override via ?return_to=... for testing.
  const qp = new URLSearchParams(location.search);
  const override = qp.get('return_to');
  if (override) return override;

  // Persist the last intent in sessionStorage so we can inspect it after coming back.
  const rt = `${SITE_ORIGIN}${location.pathname}${location.search}`;
  try { sessionStorage.setItem('kadie.return_to', rt); } catch {}
  return rt;
}
export const LOGIN_RETURN_TO = computeReturnTo();

// ---------- Public API endpoints ----------
export const ME_URL     = `${NODE_API_BASE}/me`;
export const LOGOUT_URL = `${NODE_API_BASE}/logout`;

// Guild list endpoints (try-first strategy)
export const GUILDS_URLS = [
  `${NODE_API_BASE}/guilds`,
  `${NODE_API_BASE}/api/guilds`,
  `${NODE_API_BASE}/discord/guilds`,
  `${NODE_API_BASE}/user/guilds`,
];

// Optional bot-guild membership probe
const BOT_GUILDS_URLS = [
  `${NODE_API_BASE}/bot/guilds`,
  `${NODE_API_BASE}/api/bot/guilds`,
];

// ---------- OAuth entry URL with rich hints ----------
const RAW_OAUTH_URL = `${NODE_API_BASE}/auth/discord`;
export const OAUTH_URL = (() => {
  const u = new URL(RAW_OAUTH_URL);
  const rt = LOGIN_RETURN_TO;

  // Common param names backends accept; your bot can honor any one of these.
  u.searchParams.set('return_to', rt);
  u.searchParams.set('next', rt);
  u.searchParams.set('redirect', rt);
  u.searchParams.set('redirect_to', rt);

  // Context for server logs
  u.searchParams.set('source_origin', SITE_ORIGIN);
  u.searchParams.set('is_local', String(IS_LOCAL));

  // Optional: echo page so server logs can confirm exact initiator
  u.searchParams.set('initiator_path', location.pathname || '/');

  return u.toString();
})();

// ---------- Diagnostics ----------
export function printDiagnostics(context) {
  const o = new URL(OAUTH_URL);
  const rtParam =
    o.searchParams.get('return_to') ||
    o.searchParams.get('next') ||
    o.searchParams.get('redirect_to') ||
    o.searchParams.get('redirect');

  console.group(`[DIAG] ${context}`);
  console.log('version', 'api.js v6');
  console.log('IS_LOCAL', IS_LOCAL);
  console.log('SITE_ORIGIN', SITE_ORIGIN);
  console.log('LOGIN_RETURN_TO', LOGIN_RETURN_TO);
  console.log('NODE_API_BASE', NODE_API_BASE);
  console.log('OAUTH_URL', OAUTH_URL);
  console.log('OAUTH_URL(return_to-like)', rtParam);
  try { console.log('sessionStorage.return_to', sessionStorage.getItem('kadie.return_to')); } catch {}
  console.groupEnd();
}

// Auto-bind a login link if present so you can click and immediately see the exact URL used.
(function autoWireLoginLink() {
  const selectors = ['[data-oauth-link]', 'a#login', 'a.login'];
  for (const sel of selectors) {
    const a = document.querySelector(sel);
    if (a) { a.href = OAUTH_URL; break; }
  }
  printDiagnostics(document.currentScript?.src?.split('/').pop() || 'page');
})();

// ---------- Fetch helpers ----------
async function getFirst(urls, label) {
  const attempts = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      console.info('[API]', label, url, res.status);
      if (res.ok) return { res, url };
      attempts.push({ url, status: res.status });
      if (label.startsWith('counts') && res.status === 404) break;
    } catch (e) {
      attempts.push({ url, error: e?.message || String(e) });
    }
  }
  const err = new Error('No endpoint for ' + label);
  // Expose attempts for quick console inspection.
  err.attempts = attempts;
  throw err;
}

export async function apiGet(url, label) {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  console.info('[API]', label || 'GET', url, res.status);
  return res;
}
export async function apiGetFirst(urls, label) { return getFirst(urls, label); }

export async function fetchBotGuildSet() {
  try {
    const { res } = await getFirst(BOT_GUILDS_URLS, 'bot guilds');
    const data = await res.json();
    const ids = Array.isArray(data) ? data : Array.isArray(data?.ids) ? data.ids : [];
    return new Set(ids.map(String));
  } catch {
    return null;
  }
}

// Disable counts entirely to avoid console noise on 404s.
export async function fetchGuildCounts(_id) { return null; }

// ---------- App ID helper ----------
const APP_ID_URLS = [
  `${NODE_API_BASE}/public/app-id`,
  `${NODE_API_BASE}/api/public/app-id`,
];

export async function fetchAppId() {
  const qp = new URLSearchParams(location.search).get('app_id');
  if (qp) return String(qp);

  const meta = document.querySelector('meta[name="discord-application-id"]');
  if (meta?.content) return String(meta.content);

  try {
    const { res } = await getFirst(APP_ID_URLS, 'public app id');
    if (res.ok) {
      const j = await res.json();
      if (j?.application_id) return String(j.application_id);
    }
  } catch {}

  if (window.DISCORD_APPLICATION_ID) return String(window.DISCORD_APPLICATION_ID);
  return null;
}

export function buildInviteUrl(appId, guildId, permissionsInt = 0) {
  const scopes = encodeURIComponent('bot applications.commands');
  const gid = guildId ? `&guild_id=${encodeURIComponent(guildId)}&disable_guild_select=true` : '';
  return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=${scopes}&permissions=${permissionsInt}${gid}`;
}

export const ME_URL_LABEL = 'GET /me';
export const GUILDS_URLS_LABEL = 'GET guilds';
