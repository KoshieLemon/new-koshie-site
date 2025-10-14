// /kadie-ai/server-listings.js v8
import {
  apiGet,
  apiGetFirst,
  ME_URL,
  GUILDS_URLS,
  fetchAppId,
  buildInviteUrl,
  fetchBotGuildSet,
  fetchGuildCounts,
  printDiagnostics,
  ME_URL_LABEL,
  GUILDS_URLS_LABEL
} from '/assets/api.js';

printDiagnostics('server-listings v8');

/* ---------- DOM helpers (self-initialize if HTML not updated) ---------- */
function byId(id){ return document.getElementById(id); }

function ensureDOM(){
  let page = document.querySelector('.page');
  if (!page) {
    page = document.createElement('main');
    page.className = 'page';
    document.body.appendChild(page);
  }
  if (!byId('q')) {
    const bar = document.createElement('div'); bar.className='searchbar';
    const wrap = document.createElement('div'); wrap.className='searchwrap';
    const input = document.createElement('input'); input.id='q'; input.type='search'; input.placeholder='Search servers…'; input.autocomplete='off'; input.spellcheck=false;
    wrap.appendChild(input); bar.appendChild(wrap); page.appendChild(bar);
  }
  if (!byId('status')) {
    const s = document.createElement('div'); s.id='status'; s.className='status';
    page.appendChild(s);
  }
  if (!byId('section-manageable')) {
    const sec = document.createElement('section'); sec.id='section-manageable';
    sec.innerHTML = `<h2 class="group-title">You can manage</h2><div id="list-manageable" class="list"></div>`;
    page.appendChild(sec);
  }
  if (!byId('section-popular')) {
    const sec = document.createElement('section'); sec.id='section-popular';
    sec.innerHTML = `<h2 class="group-title">Most popular</h2><div id="list-popular" class="list"></div>`;
    page.appendChild(sec);
  }
  return {
    qEl: byId('q'),
    statEl: byId('status'),
    listA: byId('list-manageable'),
    listB: byId('list-popular')
  };
}

const { qEl, statEl, listA, listB } = ensureDOM();

/* ---------- utilities ---------- */
function setError(msg){ statEl.textContent = msg; statEl.classList.add('show'); }
function clearError(){ statEl.textContent = ''; statEl.classList.remove('show'); }

function hasManagePerms(g){
  const ADMIN = 1<<3, MANAGE_GUILD = 1<<5;
  const perms = Number(g.permissions || 0);
  return Boolean(g.owner || (perms & ADMIN) || (perms & MANAGE_GUILD));
}
function iconUrl(g){ return g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null; }

function informMasterOpen(g){
  try{
    if (window.top && window.top !== window) {
      window.top.postMessage({ type: 'openServer', guild: { id: g.id, name: g.name || '', icon: g.icon || '' } }, '*');
      return true;
    }
  }catch{}
  return false;
}

/* ---------- render ---------- */
function makeRow(data){
  const { g, manageable, isBotIn, counts } = data;

  const card = document.createElement('div'); card.className = 'card';
  const url = iconUrl(g);
  if (url) {
    const i = new Image(); i.src = url; i.className = 'ico'; card.appendChild(i);
  } else {
    const d = document.createElement('div'); d.className='fallback';
    d.textContent = (g.name || '?').slice(0,1).toUpperCase();
    card.appendChild(d);
  }

  const meta = document.createElement('div'); meta.className='meta';
  const name = document.createElement('div'); name.className='name'; name.textContent = g.name ?? '(unnamed)';
  const sub  = document.createElement('div'); sub.className='sub';
  const parts = [];
  if (g.owner) parts.push('owner');
  else if (hasManagePerms(g)) parts.push('admin');
  if (isBotIn) parts.push('bot installed');
  if (counts?.total) parts.push(`${counts.total} members`);
  sub.textContent = parts.join(' • ');
  meta.appendChild(name); meta.appendChild(sub);
  card.appendChild(meta);

  const spacer = document.createElement('div'); spacer.className='spacer'; card.appendChild(spacer);

  const a = document.createElement('a');
  a.className = 'btn' + (manageable ? '' : ' secondary');
  a.textContent = manageable ? 'Open' : (isBotIn ? 'View' : 'Add bot');

  if (manageable || isBotIn) {
    a.href = '#';
    a.addEventListener('click', (e)=>{ e.preventDefault(); if (!informMasterOpen(g)) a.blur(); });
    card.style.cursor='pointer';
    card.addEventListener('click', ()=>{ if (!informMasterOpen(g)) a.blur(); });
  } else {
    a.target = '_blank';
    a.href = appId ? buildInviteUrl(appId, g.id, 0) : '#';
    if (!appId) a.setAttribute('aria-disabled','true');
  }
  card.appendChild(a);

  return card;
}

function render(filtered){
  // guard if DOM missing for any reason
  if (!listA || !listB) return;

  const manageable = filtered.filter(r => r.manageable || (r.isBotIn && hasManagePerms(r.g)));
  const others     = filtered.filter(r => !manageable.includes(r));

  manageable.sort((a,b)=>{
    const wa = a.g.owner ? 0 : hasManagePerms(a.g) ? 1 : 2;
    const wb = b.g.owner ? 0 : hasManagePerms(b.g) ? 1 : 2;
    return wa - wb || a.g.name.localeCompare(b.g.name);
  });

  others.sort((a,b)=>{
    const at = a.counts?.total ?? -1, bt = b.counts?.total ?? -1;
    const ao = a.counts?.online ?? -1, bo = b.counts?.online ?? -1;
    return (bt - at) || (bo - ao) || a.g.name.localeCompare(b.g.name);
  });

  listA.innerHTML = manageable.length ? '' : '<div class="empty">No manageable servers found.</div>';
  listB.innerHTML = others.length ? '' : '<div class="empty">No other servers to show.</div>';

  const fragA = document.createDocumentFragment();
  manageable.forEach(r => fragA.appendChild(makeRow(r)));
  listA.appendChild(fragA);

  const fragB = document.createDocumentFragment();
  others.forEach(r => fragB.appendChild(makeRow(r)));
  listB.appendChild(fragB);
}

/* ---------- search ---------- */
function applySearch(){
  const q = qEl.value.trim().toLowerCase();
  if (!q) { render(rows); return; }
  const f = rows.filter(r => (r.g.name||'').toLowerCase().includes(q) || String(r.g.id).includes(q));
  render(f);
}

/* ---------- data flow ---------- */
let appId = null;
let rows = [];

(async () => {
  try {
    // session check (errors only)
    const meRes = await apiGet(ME_URL, ME_URL_LABEL);
    if (meRes.status === 401) setError(`Not logged in. <a href="/kadie-ai/kadie-ai.html">Sign in with Discord</a>`);

    // guilds
    const { res: gRes } = await apiGetFirst(GUILDS_URLS, GUILDS_URLS_LABEL);
    if (!gRes.ok) { setError(`Guilds error: ${gRes.status} ${gRes.statusText}`); return; }
    const guilds = await gRes.json();
    if (!Array.isArray(guilds)) { setError('Guilds payload invalid.'); return; }

    // app + bot membership set
    const [appid, botSet] = await Promise.all([fetchAppId(), fetchBotGuildSet()]);
    appId = appid || null;

    // counts in parallel, tolerant
    const countEntries = await Promise.all(guilds.map(async g => {
      try { return [g.id, await fetchGuildCounts(g.id)]; }
      catch { return [g.id, null]; }
    }));
    const countMap = new Map(countEntries);

    rows = guilds.map(g => ({
      g,
      manageable: hasManagePerms(g) || g.owner,
      isBotIn: botSet ? botSet.has(String(g.id)) : false,
      counts: countMap.get(g.id) || null
    }));

    clearError();
    render(rows);

    qEl.addEventListener('input', applySearch);
  } catch (err) {
    setError('Network or CORS error.');
    console.error('[server-listings] fatal', err);
  }
})();
