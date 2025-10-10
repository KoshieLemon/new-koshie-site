// /assets/api.js
// Ensures OAuth comes back to the current origin (localhost vs production).
// Version: api.js v5

export const NODE_API_BASE = 'https://kadie-ai-node.up.railway.app';

// Detect local vs prod from the page you're on.
export const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export const SITE_ORIGIN = IS_LOCAL ? 'http://localhost:8080' : location.origin;

// Compute a stable "return to here" URL, preserving path and query.
export const LOGIN_RETURN_TO = `${SITE_ORIGIN}${location.pathname}${location.search}`;

// Core API endpoints
export const ME_URL      = `${NODE_API_BASE}/me`;
export const LOGOUT_URL  = `${NODE_API_BASE}/logout`;

// Preferred auth entry. Include multiple common param names to maximize backend compatibility.
const RAW_OAUTH_URL = `${NODE_API_BASE}/auth/discord`;
export const OAUTH_URL = (() => {
  const u = new URL(RAW_OAUTH_URL);
  const rt = LOGIN_RETURN_TO;
  // Common synonyms backends look for:
  u.searchParams.set('return_to', rt);
  u.searchParams.set('next', rt);
  u.searchParams.set('redirect', rt);
  u.searchParams.set('redirect_to', rt);
  // Optional context hints:
  u.searchParams.set('source_origin', SITE_ORIGIN);
  u.searchParams.set('is_local', String(IS_LOCAL));
  return u.toString();
})();

// Optional: programmatic builder if callers want a custom landing path.
export function buildAuthUrl(toUrl) {
  const dest = toUrl || LOGIN_RETURN_TO;
  const u = new URL(RAW_OAUTH_URL);
  u.searchParams.set('return_to', dest);
  u.searchParams.set('next', dest);
  u.searchParams.set('redirect', dest);
  u.searchParams.set('redirect_to', dest);
  u.searchParams.set('source_origin', SITE_ORIGIN);
  u.searchParams.set('is_local', String(IS_LOCAL));
  return u.toString();
}

// Guild lists: try multiple paths, keep cookies for session on the bot domain.
export const GUILDS_URLS = [
  `${NODE_API_BASE}/guilds`,
  `${NODE_API_BASE}/api/guilds`,
  `${NODE_API_BASE}/discord/guilds`,
  `${NODE_API_BASE}/user/guilds`,
];

// Optional helpers
const BOT_GUILDS_URLS = [
  `${NODE_API_BASE}/bot/guilds`,
  `${NODE_API_BASE}/api/bot/guilds`,
];

export function printDiagnostics(context) {
  console.group(`[DIAG] ${context}`);
  console.log('version', 'api.js v5');
  console.log('IS_LOCAL', IS_LOCAL);
  console.log('SITE_ORIGIN', SITE_ORIGIN);
  console.log('LOGIN_RETURN_TO', LOGIN_RETURN_TO);
  console.log('NODE_API_BASE', NODE_API_BASE);
  console.log('OAUTH_URL', OAUTH_URL);
  console.groupEnd();
}

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
  } catch { return null; }
}

// Disable counts entirely. Your API returns 404 and floods logs.
export async function fetchGuildCounts(_id) { return null; }

// Resolve App ID from query, meta, or bot API.
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
