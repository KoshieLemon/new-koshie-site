export function qp(name){ return new URLSearchParams(location.search).get(name) || ''; }

export const gid   = qp('guild_id');
export const gname = decodeURIComponent(qp('guild_name') || '');
export const gicon = qp('guild_icon') || '';
export const total = Number(qp('total') || '') || null;
export const online = Number(qp('online') || '') || null;

// API base: query param override -> stored value -> default
const paramBot   = qp('bot');
const storedBot  = localStorage.getItem('kadie.bot_base') || '';
const defaultBot = 'https://kadie-ai-node.up.railway.app';
export const BOT_BASE = (paramBot || storedBot || defaultBot).replace(/\/+$/,'');

export const USE_FIREBASE_CLIENT = !!window.firebaseConfig;

// Optional helper to change at runtime from console: kadie.setBotBase('https://kadie-ai-node.up.railway.app')
export function setBotBase(u){
  if (!u) return;
  localStorage.setItem('kadie.bot_base', String(u).replace(/\/+$/,''));
  location.reload();
}
window.kadie = Object.assign(window.kadie || {}, { setBotBase });
