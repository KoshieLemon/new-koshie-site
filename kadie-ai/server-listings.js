// /kadie-ai/server-listings.js v16
import {
  apiGet,
  apiGetFirst,
  ME_URL,
  GUILDS_URLS,
  fetchAppId,
  buildInviteUrl,
  fetchBotGuildSet,
  printDiagnostics,
  ME_URL_LABEL,
  GUILDS_URLS_LABEL
} from './api.js';

printDiagnostics('server-listings v16');

/* ---------- DOM ---------- */
const byId = (id)=>document.getElementById(id);
function ensureDOM(){
  let page = document.querySelector('.page');
  if (!page) { page = document.createElement('main'); page.className='page'; document.body.appendChild(page); }
  if (!document.querySelector('.title')) {
    const h = document.createElement('h2'); h.className='title'; h.textContent='Select a server'; page.appendChild(h);
  }
  if (!byId('q')) {
    const bar = document.createElement('div'); bar.className='searchbar';
    const wrap = document.createElement('div'); wrap.className='searchwrap';
    const input = document.createElement('input'); input.id='q'; input.type='search'; input.placeholder='Search servers…'; input.autocomplete='off'; input.spellcheck=false;
    wrap.appendChild(input); bar.appendChild(wrap); page.appendChild(bar);
  }
  if (!byId('status')) { const s = document.createElement('div'); s.id='status'; s.className='status'; page.appendChild(s); }
  if (!byId('list-all')) {
    const sec = document.createElement('section'); sec.id='section-all';
    sec.innerHTML = `<div id="list-all" class="list"></div>`;
    page.appendChild(sec);
  }
  return { qEl: byId('q'), statEl: byId('status'), list: byId('list-all') };
}
const { qEl, statEl, list } = ensureDOM();

/* ---------- utils ---------- */
const setError=(m)=>{ statEl.innerHTML=m; statEl.classList.add('show'); };
const clearError=()=>{ statEl.textContent=''; statEl.classList.remove('show'); };

const ADMIN = 1<<3, MANAGE_GUILD = 1<<5;
const hasManagePerms = g => Boolean(g.owner || (Number(g.permissions||0)&ADMIN) || (Number(g.permissions||0)&MANAGE_GUILD));
const roleOf = g => g.owner ? 'owner' : hasManagePerms(g) ? 'admin' : 'not permitted';
const iconUrl = g => g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null;

const jsonSafe = (res)=>res.json().catch(()=>null);

function countsAvailable(c){
  if (!c) return false;
  const n = v => typeof v === 'number' && isFinite(v) && v > 0;
  return n(c.total) || n(c.online);
}

/* Counts endpoint: single route. */
async function getCounts(apiOrigin, gid){
  try{
    const r = await fetch(`${apiOrigin}/api/guilds/${gid}/counts`, { credentials:'include' });
    if (!r.ok) return null;
    const j = await jsonSafe(r);
    if (!j) return null;
    const total  = typeof j.total  === 'number' ? j.total  : null;
    const online = typeof j.online === 'number' ? j.online : null;
    return { total, online };
  }catch{ return null; }
}

function informMasterOpen(g){
  try{
    if (window.top && window.top !== window) {
      window.top.postMessage({ type:'openServer', guild:{ id:g.id, name:g.name||'', icon:g.icon||'' } }, '*');
      return true;
    }
  }catch{}
  return false;
}

/* ---------- caching (session-wide) ---------- */
const CACHE_KEY = 'kadie.guilds.cache.v1';
function readCache(){
  try{
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!Array.isArray(j.guilds)) return null;
    return j;
  }catch{return null;}
}
function writeCache(obj){
  try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify(obj)); }catch{}
}

/* ---------- state ---------- */
let appId = null;
let rows = [];
let apiOrigin = location.origin;
let badgeSlots = new Map();

/* ---------- rendering ---------- */
function makeRow(data, appId){
  const { g, isBotIn } = data;
  const role = roleOf(g);
  const manageable = role !== 'not permitted';

  const card = document.createElement('div'); card.className=`card ${role.replace(' ','-')}`; card.dataset.gid = g.id;
  const url = iconUrl(g);
  if (url){ const i=new Image(); i.src=url; i.className='ico'; card.appendChild(i); }
  else { const d=document.createElement('div'); d.className='fallback'; d.textContent=(g.name||'?').slice(0,1).toUpperCase(); card.appendChild(d); }

  const meta = document.createElement('div'); meta.className='meta';
  const name = document.createElement('div'); name.className='name'; name.textContent = g.name ?? '(unnamed)';
  meta.appendChild(name);
  card.appendChild(meta);

  const spacer = document.createElement('div'); spacer.className='spacer'; card.appendChild(spacer);

  // Badges slot (lazy counts)
  const badges = document.createElement('div'); badges.className='badges';
  const skel = document.createElement('span'); skel.className='badge skeleton'; skel.style.width='72px'; skel.textContent=' ';
  badges.appendChild(skel);
  card.appendChild(badges);
  badgeSlots.set(String(g.id), { card, badges });

  if (manageable){
    if (isBotIn){
      const a = document.createElement('a');
      a.className='btn'; a.textContent='Manage'; a.href='#';
      a.addEventListener('click', (e)=>{ e.preventDefault(); if (!informMasterOpen(g)) a.blur(); });
      card.style.cursor='pointer';
      card.addEventListener('click', ()=>{ if (!informMasterOpen(g)) a.blur(); });
      card.appendChild(a);
    } else {
      const a=document.createElement('a'); a.className='btn'; a.textContent='Add Bot';
      if (appId){ a.target='_blank'; a.href=buildInviteUrl(appId, g.id, 0); } else { a.href='#'; a.setAttribute('aria-disabled','true'); }
      card.appendChild(a);
    }
  }

  const wm = document.createElement('div'); wm.className='role-watermark'; wm.textContent = role.toUpperCase();
  card.appendChild(wm);

  if (!manageable) card.classList.add('not-permitted');
  return card;
}

function renderList(data){
  if (!list) return;
  // stable sort
  const weight = r => r.g.owner ? 0 : hasManagePerms(r.g) ? 1 : 2;
  const arr = [...data].sort((a,b)=> weight(a)-weight(b) || a.g.name.localeCompare(b.g.name));

  list.innerHTML = data.length ? '' : '<div class="empty">No servers to show.</div>';
  badgeSlots = new Map();

  // Chunked append
  const CHUNK = 24;
  let i = 0;
  function push(){
    const frag = document.createDocumentFragment();
    for (let k=0; k<CHUNK && i<arr.length; k++, i++){
      const node = makeRow(arr[i], appId);
      frag.appendChild(node);
      observeForCounts(node, arr[i].g.id);
    }
    list.appendChild(frag);
    if (i < arr.length) {
      (window.requestIdleCallback || window.requestAnimationFrame)(push);
    }
  }
  push();
}

function applySearch(){
  const q = qEl.value.trim().toLowerCase();
  if (!q) { renderList(rows); return; }
  const f = rows.filter(r => (r.g.name||'').toLowerCase().includes(q) || String(r.g.id).includes(q));
  renderList(f);
}

/* ---------- lazy counts with limited concurrency ---------- */
const MAX_PARALLEL = 6;
let inflight = 0;
const queue = [];
const seen = new Set();

function observeForCounts(card, gid){
  if (seen.has(gid)) return; // already scheduled once
  const io = observeForCounts._io || (observeForCounts._io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if (!e.isIntersecting) return;
      const id = e.target.dataset.gid;
      if (!id || seen.has(id)) { observeForCounts._io.unobserve(e.target); return; }
      seen.add(id);
      observeForCounts._io.unobserve(e.target);
      queue.push(id);
      pumpCounts();
    });
  }, { root:null, rootMargin:'200px', threshold:0.01 }));
  io.observe(card);
}

function pumpCounts(){
  while (inflight < MAX_PARALLEL && queue.length){
    const id = queue.shift();
    inflight++;
    getCounts(apiOrigin, id).then(c=>{
      updateCountsDom(id, c);
    }).finally(()=>{ inflight--; pumpCounts(); });
  }
}

function updateCountsDom(gid, counts){
  const slot = badgeSlots.get(String(gid));
  if (!slot) return;
  const { badges } = slot;
  badges.innerHTML = '';
  if (!countsAvailable(counts)) return;
  if (typeof counts.online === 'number' && counts.online > 0){
    const onl = document.createElement('span'); onl.className='badge'; onl.textContent=`Online ${counts.online}`;
    badges.appendChild(onl);
  }
  if (typeof counts.total === 'number' && counts.total > 0){
    const tot = document.createElement('span'); tot.className='badge'; tot.textContent=`Total ${counts.total}`;
    badges.appendChild(tot);
  }
}

/* ---------- data flow ---------- */
let botSet = null;

function setSearchHandler(){
  let t = 0;
  qEl.removeEventListener('input', qEl._handler || (()=>{}));
  qEl._handler = (e)=>{ clearTimeout(t); t = setTimeout(applySearch, 60); };
  qEl.addEventListener('input', qEl._handler);
}

function toRows(guilds){
  return guilds.map(g => ({
    g,
    isBotIn: botSet ? botSet.has(String(g.id)) : false
  }));
}

async function bootstrapFromCache(){
  const c = readCache();
  if (!c) return false;
  try{
    appId = c.appId || null;
    apiOrigin = c.apiOrigin || location.origin;
    botSet = new Set((c.botGuildIds||[]).map(String));
    rows = toRows(c.guilds || []);
    clearError();
    renderList(rows);
    setSearchHandler();
    return true;
  }catch{ return false; }
}

async function fetchFreshAndRender(){
  try {
    const meRes = await apiGet(ME_URL, ME_URL_LABEL);
    if (meRes.status === 401) setError(`Not logged in. <a href="/kadie-ai/kadie-ai.html">Sign in with Discord</a>`);

    const { res: gRes } = await apiGetFirst(GUILDS_URLS, GUILDS_URLS_LABEL);
    if (!gRes.ok) { setError(`Guilds error: ${gRes.status} ${gRes.statusText}`); return; }
    const guilds = await gRes.json();
    if (!Array.isArray(guilds)) { setError('Guilds payload invalid.'); return; }

    apiOrigin = (()=>{ try { return new URL(gRes.url).origin; } catch { return location.origin; } })();

    const [appid, botGuildSet] = await Promise.all([fetchAppId(), fetchBotGuildSet()]);
    appId = appid || null;
    botSet = botGuildSet || null;

    rows = toRows(guilds);
    clearError();
    renderList(rows);
    setSearchHandler();

    // cache for this tab session
    writeCache({
      appId,
      apiOrigin,
      botGuildIds: botSet ? Array.from(botSet) : [],
      guilds
    });
  } catch {
    setError('Network or CORS error.');
  }
}

/* ---------- boot ---------- */
(async () => {
  const hadCache = await bootstrapFromCache(); // immediate paint if available
  fetchFreshAndRender(); // refresh in background (reuses cache if user returns)
})();
