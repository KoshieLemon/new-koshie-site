// /kadie-ai/server-listings.js v15
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
} from '/assets/api.js';

printDiagnostics('server-listings v15');

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

/* Single endpoint only to avoid 404s.
   Hides badges if not available. Never logs console errors. */
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

/* ---------- render ---------- */
function makeRow(data, appId){
  const { g, isBotIn, counts } = data;
  const role = roleOf(g);
  const manageable = role !== 'not permitted';

  const card = document.createElement('div'); card.className=`card ${role.replace(' ','-')}`;
  const url = iconUrl(g);
  if (url){ const i=new Image(); i.src=url; i.className='ico'; card.appendChild(i); }
  else { const d=document.createElement('div'); d.className='fallback'; d.textContent=(g.name||'?').slice(0,1).toUpperCase(); card.appendChild(d); }

  const meta = document.createElement('div'); meta.className='meta';
  const name = document.createElement('div'); name.className='name'; name.textContent = g.name ?? '(unnamed)';
  meta.appendChild(name);
  card.appendChild(meta);

  const spacer = document.createElement('div'); spacer.className='spacer'; card.appendChild(spacer);

  if (countsAvailable(counts)){
    const badges = document.createElement('div'); badges.className='badges';
    if (typeof counts?.online === 'number' && counts.online > 0){
      const onl = document.createElement('span'); onl.className='badge'; onl.textContent = `Online ${counts.online}`;
      badges.appendChild(onl);
    }
    if (typeof counts?.total === 'number' && counts.total > 0){
      const tot = document.createElement('span'); tot.className='badge'; tot.textContent = `Total ${counts.total}`;
      badges.appendChild(tot);
    }
    if (badges.children.length) card.appendChild(badges);
  }

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

function render(filtered, appId){
  if (!list) return;
  const weight = r => r.g.owner ? 0 : hasManagePerms(r.g) ? 1 : 2;
  filtered.sort((a,b)=> weight(a)-weight(b) || a.g.name.localeCompare(b.g.name));
  list.innerHTML = filtered.length ? '' : '<div class="empty">No servers to show.</div>';
  const frag = document.createDocumentFragment();
  filtered.forEach(r => frag.appendChild(makeRow(r, appId)));
  list.appendChild(frag);
}

/* ---------- search ---------- */
function applySearch(){
  const q = qEl.value.trim().toLowerCase();
  if (!q) { render(rows, appId); return; }
  const f = rows.filter(r => (r.g.name||'').toLowerCase().includes(q) || String(r.g.id).includes(q));
  render(f, appId);
}

/* ---------- data flow ---------- */
let appId = null;
let rows = [];

(async () => {
  try {
    const meRes = await apiGet(ME_URL, ME_URL_LABEL);
    if (meRes.status === 401) setError(`Not logged in. <a href="/kadie-ai/kadie-ai.html">Sign in with Discord</a>`);

    const { res: gRes } = await apiGetFirst(GUILDS_URLS, GUILDS_URLS_LABEL);
    if (!gRes.ok) { setError(`Guilds error: ${gRes.status} ${gRes.statusText}`); return; }
    const guilds = await gRes.json();
    if (!Array.isArray(guilds)) { setError('Guilds payload invalid.'); return; }

    const apiOrigin = (()=>{ try { return new URL(gRes.url).origin; } catch { return location.origin; } })();

    const [appid, botSet] = await Promise.all([fetchAppId(), fetchBotGuildSet()]);
    appId = appid || null;

    // Fetch counts only from stable API route; ignore failures silently.
    const countEntries = await Promise.all(guilds.map(async g => {
      const c = await getCounts(apiOrigin, g.id);
      return [g.id, c];
    }));
    const countMap = new Map(countEntries);

    rows = guilds.map(g => ({
      g,
      isBotIn: botSet ? botSet.has(String(g.id)) : false,
      counts: countMap.get(g.id) || null
    }));

    clearError();
    render(rows, appId);
    qEl.addEventListener('input', applySearch);
  } catch {
    setError('Network or CORS error.');
  }
})();
