export function qp(name){ return new URLSearchParams(location.search).get(name) || ''; }

export const gid   = qp('guild_id');
export const gname = decodeURIComponent(qp('guild_name') || '');
export const gicon = qp('guild_icon') || '';
export const total = Number(qp('total')) || null;
export const online = Number(qp('online')) || null;

export const BOT_BASE = new URLSearchParams(location.search).get('bot')
  || 'https://kadie-ai-production.up.railway.app';

export const USE_FIREBASE_CLIENT = !!window.firebaseConfig;
