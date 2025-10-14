// /kadie-ai/bot-options-src/events-ui.js
// Shows an orange badge on each node when it triggers. Updates elapsed time.
// Subscribes to the bot's SSE stream: /runtime/events/stream?guild_id=...

import { BOT_BASE, gid } from './config.js';

const last = new Map(); // Map<nodeId, timestamp>
let ticking = false;

function now() { return Date.now(); }
function byId(id) { return document.getElementById(id); }
function currentBlueprintId() {
  const el = byId('bpSelect');
  return el && el.value ? String(el.value) : null;
}

// Inject minimal CSS once
(function injectCSS(){
  const css = `
  .node{position:absolute}
  .node .kadie-badge{
    position:absolute; top:6px; right:6px; z-index:5;
    background:#fb923c; color:#111; font-weight:700; font-size:11px;
    border:1px solid #7a3e16; border-radius:6px; padding:2px 6px;
    box-shadow:0 1px 4px #0007; pointer-events:none;
  }`;
  const tag = document.createElement('style');
  tag.textContent = css;
  document.head.appendChild(tag);
})();

function fmt(ms){
  if (ms < 1000) return `${ms}ms`;
  const s = ms/1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s/60);
  const rs = s - m*60;
  return `${m}m ${rs.toFixed(1)}s`;
}

function ensureBadge(nodeId){
  const node = document.querySelector(`.node[data-nid="${CSS.escape(nodeId)}"]`);
  if (!node) return null;
  let b = node.querySelector('.kadie-badge');
  if (!b){
    b = document.createElement('span');
    b.className = 'kadie-badge';
    b.textContent = '—';
    node.appendChild(b);
  }
  return b;
}

function paint(){
  ticking = false;
  const bp = currentBlueprintId();
  for (const [nid, ts] of last){
    const b = ensureBadge(nid);
    if (!b) continue;
    const age = Math.max(0, now() - ts);
    b.textContent = fmt(age);
    // Fade after 10s
    const alpha = age < 10000 ? 1 : Math.max(0.2, 1 - (age-10000)/20000);
    b.style.opacity = String(Math.min(1, Math.max(0.2, alpha)));
  }
}

function requestPaint(){
  if (!ticking){
    ticking = true;
    requestAnimationFrame(paint);
  }
}

function handleEvent(ev){
  // Expected payload: { t, guild_id, blueprint_id, node_id }
  try{
    const data = JSON.parse(ev.data);
    const bp = currentBlueprintId();
    if (!data || data.guild_id !== gid) return;
    // If a blueprint is selected, only show its events
    if (bp && data.blueprint_id && data.blueprint_id !== bp) return;
    if (!data.node_id) return;

    last.set(String(data.node_id), Number(data.t || now()));
    requestPaint();
  }catch{}
}

function startSSE(){
  if (!gid) return;
  const url = `${BOT_BASE}/runtime/events/stream?guild_id=${encodeURIComponent(gid)}`;
  let es = new EventSource(url);

  es.onmessage = handleEvent;
  es.onerror = () => {
    es.close();
    // Fallback: poll every 1s with a rolling cursor
    startPolling();
  };

  // Also refresh badges on selection change
  const sel = byId('bpSelect');
  if (sel) sel.addEventListener('change', requestPaint);
}

let pollTimer = null;
let since = 0;
async function pollOnce(){
  try{
    const url = `${BOT_BASE}/runtime/events?guild_id=${encodeURIComponent(gid)}&since=${since}`;
    const r = await fetch(url).catch(()=>null);
    if (!r || !r.ok) return;
    const arr = await r.json();
    for (const e of arr){
      since = Math.max(since, Number(e.t||0));
      handleEvent({ data: JSON.stringify(e) });
    }
  }catch{}
}
function startPolling(){
  if (pollTimer) return;
  pollTimer = setInterval(pollOnce, 1000);
}

startSSE();
// periodic repaint so elapsed time text changes
setInterval(requestPaint, 120);
