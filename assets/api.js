// /assets/api.js
export const NODE_API_BASE = 'https://kadie-ai-node.up.railway.app';

export const IS_LOCAL =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export const SITE_ORIGIN = IS_LOCAL ? 'http://localhost:8080' : location.origin;

export const OAUTH_URL  = `${NODE_API_BASE}/auth/discord`;
export const ME_URL     = `${NODE_API_BASE}/me`;

export const GUILDS_URLS = [
  `${NODE_API_BASE}/guilds`,
  `${NODE_API_BASE}/api/guilds`,
  `${NODE_API_BASE}/discord/guilds`,
  `${NODE_API_BASE}/user/guilds`,
];

export const LOGOUT_URL = `${NODE_API_BASE}/logout`;

function getParam(name){ return new URLSearchParams(location.search).get(name); }

export async function apiGet(url, label) {
  const tag = label || 'request';
  console.info(`[API] ${tag} ->`, url, { withCredentials: true, origin: location.origin });
  const res = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
  console.info(`[API] ${tag} status`, res.status, res.statusText);
  return res;
}

export async function apiGetFirst(urls, label) {
  const attempts = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
      console.info(`[API] ${label} -> ${url} status ${res.status}`);
      if (res.status === 404) { attempts.push({ url, status: 404 }); continue; }
      return { res, url };
    } catch (e) {
      attempts.push({ url, error: e?.message || String(e) });
    }
  }
  const err = new Error('No matching endpoint for ' + label);
  err.attempts = attempts;
  throw err;
}

export function printDiagnostics(context) {
  console.group(`[DIAG] ${context}`);
  console.log('IS_LOCAL:', IS_LOCAL);
  console.log('SITE_ORIGIN:', SITE_ORIGIN);
  console.log('NODE_API_BASE:', NODE_API_BASE);
  console.log('Location:', location.href);
  console.log('Third-party cookie risk:', !IS_LOCAL && location.protocol === 'https:' ? 'possible' : 'low');
  console.log('CORS requirement:', `Server must allow origin ${location.origin} and set Access-Control-Allow-Credentials: true`);
  console.groupEnd();
}

// ---------- Optional helpers ----------
const BOT_GUILDS_URLS = [
  `${NODE_API_BASE}/bot/guilds`,
  `${NODE_API_BASE}/api/bot/guilds`,
];
const GUILD_COUNTS_URLS = (id) => [
  `${NODE_API_BASE}/guilds/${id}/counts`,
  `${NODE_API_BASE}/api/guilds/${id}/counts`,
];
const APP_ID_URLS = [
  `${NODE_API_BASE}/public/app-id`,
  `${NODE_API_BASE}/api/public/app-id`,
];

export async function fetchBotGuildSet() {
  try {
    const { res } = await apiGetFirst(BOT_GUILDS_URLS, 'GET bot guilds');
    const data = await res.json();
    const ids = Array.isArray(data) ? data : Array.isArray(data?.ids) ? data.ids : [];
    return new Set(ids.map(String));
  } catch { return null; }
}

// Disable counts after first failure to avoid repeated 404s.
let COUNTS_DISABLED = false;

export async function fetchGuildCounts(id) {
  if (COUNTS_DISABLED) return null;
  try {
    const { res } = await apiGetFirst(GUILD_COUNTS_URLS(id), `GET counts ${id}`);
    if (!res.ok) return null;
    const j = await res.json();
    const total = j.approximate_member_count ?? j.member_count ?? null;
    const online = j.approximate_presence_count ?? j.online ?? null;
    return { total, online };
  } catch {
    COUNTS_DISABLED = true; // stop further attempts this session
    return null;
  }
}

// Application ID resolution (client_id)
export async function fetchAppId() {
  // 0) URL param override: ?app_id=123456789012345678
  const qp = getParam('app_id');
  if (qp) { console.info('[APP_ID] from query param'); return String(qp); }

  // 1) Meta tag: <meta name="discord-application-id" content="123...">
  const meta = document.querySelector('meta[name="discord-application-id"]');
  if (meta?.content) { console.info('[APP_ID] from meta tag'); return String(meta.content); }

  // 2) Backend endpoint (non-secret)
  try {
    const { res } = await apiGetFirst(APP_ID_URLS, 'GET app id');
    if (res.ok) {
      const j = await res.json();
      if (j?.application_id) { console.info('[APP_ID] from backend'); return String(j.application_id); }
    }
  } catch {}

  // 3) Global: window.DISCORD_APPLICATION_ID = '123...'
  if (window.DISCORD_APPLICATION_ID) { console.info('[APP_ID] from window global'); return String(window.DISCORD_APPLICATION_ID); }

  console.warn('[APP_ID] not found');
  return null;
}

export function buildInviteUrl(appId, guildId, permissionsInt = 0) {
  const scopes = encodeURIComponent('bot applications.commands');
  const gid = guildId ? `&guild_id=${encodeURIComponent(guildId)}&disable_guild_select=true` : '';
  return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=${scopes}&permissions=${permissionsInt}${gid}`;
}
