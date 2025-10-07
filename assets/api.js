// /assets/api.js
// Frontend constants and helpers.
// Node OAuth service base. Do not change here unless you rename the service.
export const NODE_API_BASE = 'https://kadie-ai-node.up.railway.app';

// Simple environment detection for logging and UI hints.
export const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export const SITE_ORIGIN = IS_LOCAL ? 'http://localhost:8080' : 'https://koshiestudios.com';

// OAuth endpoints exposed by the Node service.
export const OAUTH_URL = `${NODE_API_BASE}/auth/discord`;
export const ME_URL = `${NODE_API_BASE}/me`;
export const GUILDS_URL = `${NODE_API_BASE}/guilds`;   // expected route
export const LOGOUT_URL = `${NODE_API_BASE}/logout`;   // optional

// Fetch with credentials + verbose diagnostics.
export async function apiGet(url, label) {
  const tag = label || 'request';
  console.info(`[API] ${tag} ->`, url, { withCredentials: true, origin: location.origin });
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',    // send/receive kadie_session cookie
    cache: 'no-store',
  });
  console.info(`[API] ${tag} status`, res.status, res.statusText);
  return res;
}

// Quick checks printed to console to accelerate debugging.
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
