// variables/variables-api.js
// Server I/O and local snapshot helpers for the Variables Dock.
// Guild data removed: only Firebase variables are loaded/saved.
// Also exports generic runtime fetch helpers usable by the node renderer.

import { VDock, KEYS } from './variables-ctx.js';

/* ========== generic helpers ========== */
export async function fetchFirstOkJson(urls){
  for (const url of urls){
    try{
      const r = await fetch(url, { headers:{ Accept:'application/json' }, method:'GET', credentials:'include' });
      if (r.ok){
        const j = await r.json().catch(()=>[]);
        return Array.isArray(j) ? j : (Array.isArray(j?.roles) ? j.roles : j);
      }
      if (r.status === 404) continue;
    }catch{}
  }
  return [];
}
export async function postFirstOk(urls, body){
  const headers = { 'content-type':'application/json', 'accept':'application/json' };
  for (const url of urls){
    try{
      const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body), credentials:'include' });
      if (r.ok) return true;
    }catch{}
  }
  return false;
}

/** Build runtime URLs for a guild and leaf path. Tries BOT_BASE, /runtime, and /api/runtime. */
export function runtimeUrls(gid, leaf, botBase){
  if (!gid) return [];
  const base = String(botBase || '').replace(/\/+$/,'');
  const g = encodeURIComponent(gid);
  const p = String(leaf || '').replace(/^\/+/,'');
  const origin = (typeof location !== 'undefined' ? location.origin : '');
  const list = [];
  if (base)   list.push(`${base}/runtime/guilds/${g}/${p}`);
  if (origin) list.push(`${origin}/runtime/guilds/${g}/${p}`);
  if (origin) list.push(`${origin}/api/runtime/guilds/${g}/${p}`);
  return list;
}

/* ========== variables dock, local snapshot ========== */
export function readLocalSnap(){
  try{
    const s = localStorage.getItem(KEYS.LOCAL_SNAP);
    const a = s ? JSON.parse(s) : [];
    return Array.isArray(a) ? a : [];
  }catch{ return []; }
}
export function writeLocalSnap(arr){
  try{ localStorage.setItem(KEYS.LOCAL_SNAP, JSON.stringify(arr||[])); }catch{}
}

/* ========== variables CRUD (Firebase only) ========== */
function urlsFor(path){
  const { gid, BOT_BASE } = VDock;
  if (!gid) return [];
  return runtimeUrls(gid, path, BOT_BASE);
}
export async function loadVariables(){
  if (!VDock.gid){ VDock.SNAP = []; VDock.VARS = []; return; }
  const server = await fetchFirstOkJson(urlsFor('variables'));
  const base = Array.isArray(server) && server.length ? server : readLocalSnap();
  VDock.SNAP = JSON.parse(JSON.stringify(base));
  VDock.VARS = JSON.parse(JSON.stringify(base));
}
export async function saveVariables(){
  const ok = await postFirstOk(urlsFor('variables'), VDock.VARS);
  if (ok){
    VDock.SNAP = JSON.parse(JSON.stringify(VDock.VARS));
    writeLocalSnap(VDock.SNAP);
  }
  return ok;
}

/* ========== generic roles loader (for renderer) ========== */
export async function loadRolesForGuild(gid, botBase){
  const urls = runtimeUrls(gid, 'roles', botBase);
  const out = await fetchFirstOkJson(urls);
  return Array.isArray(out) ? out : [];
}
