// File: kadie-ai-node/variables/variables-api.js
// Server I/O and local snapshot helpers for the Variables Dock.
// Guild data removed: only Firebase variables are loaded/saved.

import { VDock, KEYS } from './variables-ctx.js';

async function fetchFirstOkJson(urls){
  for (const url of urls){
    try{
      const r = await fetch(url, { headers:{ Accept:'application/json' }, method:'GET' });
      if (r.ok){
        const j = await r.json().catch(()=>[]);
        return Array.isArray(j) ? j : [];
      }
      if (r.status === 404) continue;
    }catch{}
  }
  return [];
}
async function postFirstOk(urls, body){
  const headers = { 'content-type':'application/json', 'accept':'application/json' };
  for (const url of urls){
    try{
      const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
      if (r.ok) return true;
    }catch{}
  }
  return false;
}

function urlsFor(path){
  const { gid, BOT_BASE } = VDock;
  if (!gid) return [];
  return [
    `${BOT_BASE}/runtime/guilds/${encodeURIComponent(gid)}/${path}`,
    `${location.origin}/runtime/guilds/${encodeURIComponent(gid)}/${path}`,
    `${location.origin}/api/runtime/guilds/${encodeURIComponent(gid)}/${path}`,
  ];
}

// Local snapshot
export function readLocalSnap(){
  try{
    const s = localStorage.getItem(KEYS.LOCAL_SNAP);
    const a = s ? JSON.parse(s) : [];
    return Array.isArray(a) ? a : [];
  }catch{
    return [];
  }
}
export function writeLocalSnap(arr){
  try{ localStorage.setItem(KEYS.LOCAL_SNAP, JSON.stringify(arr||[])); }catch{}
}

// Variables CRUD (Firebase only)
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
