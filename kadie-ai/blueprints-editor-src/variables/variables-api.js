// variables-api.js
// Server I/O and local snapshot helpers for the Variables Dock.

import { VDock, KEYS } from './variables-ctx.js';

async function fetchFirstOkJson(urls){
  for (const url of urls){
    try{
      const r = await fetch(url, { headers:{ Accept:'application/json' }, method:'GET' });
      if (r.ok){ const j = await r.json().catch(()=>[]); return Array.isArray(j) ? j : []; }
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
  try{ const s = localStorage.getItem(KEYS.LOCAL_SNAP); const a = s?JSON.parse(s):[]; return Array.isArray(a)?a:[]; }catch{ return []; }
}
export function writeLocalSnap(arr){
  try{ localStorage.setItem(KEYS.LOCAL_SNAP, JSON.stringify(arr||[])); }catch{}
}

// Variables CRUD
export async function loadVariables(){
  if (!VDock.gid){ VDock.VARS = []; VDock.SNAP = []; return; }
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

// Guild data
async function fetchFirstOk(path){ return await fetchFirstOkJson(urlsFor(path)); }

function normalizeChannels(arr){
  return (arr||[]).map(c=>({ id:String(c.id), name:String(c.name||'unnamed'), type:Number(c.type||0), position:Number(c.position||0) }));
}
function normalizeRoles(arr){
  return (arr||[]).map(r=>({ id:String(r.id), name:String(r.name||'@unknown'), color:Number(r.color||0), position:Number(r.position||0) }));
}
export function varTypeForChannel(ch){
  if (ch.type === 2) return 'VoiceBasedChannel';
  if (ch.type === 4) return 'CategoryChannel';
  return 'TextBasedChannel';
}

export async function loadGuildData(){
  if (!VDock.gid){ VDock.FULL = { channels:[], roles:[], messages:[] }; return; }
  const ch = await fetchFirstOk('channels');
  const rl = await fetchFirstOk('roles');
  const ms = await fetchFirstOk('messages');
  VDock.FULL.channels = normalizeChannels(ch);
  VDock.FULL.roles    = normalizeRoles(rl);
  VDock.FULL.messages = Array.isArray(ms) ? ms : [];
}
