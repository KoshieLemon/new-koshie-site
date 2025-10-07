// /assets/api.js
export const NODE_API_BASE = 'https://kadie-ai-node.up.railway.app';

export const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export const SITE_ORIGIN = IS_LOCAL ? 'http://localhost:8080' : location.origin;

export const OAUTH_URL  = `${NODE_API_BASE}/auth/discord`;
export const ME_URL     = `${NODE_API_BASE}/me`;

// Try these in order; stop at first non-404.
export const GUILDS_URLS = [
  `${NODE_API_BASE}/guilds`,
  `${NODE_API_BASE}/api/guilds`,
  `${NODE_API_BASE}/discord/guilds`,
  `${NODE_API_BASE}/user/guilds`
];

export const LOGOUT_URL = `${NODE_API_BASE}/logout`;

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
      console.warn(`[API] ${label} network error @ ${url}:`, e);
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
