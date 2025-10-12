// /kadie-ai/bot-options-src/guild-browser-leftdock.js
/* eslint-disable no-console */

// Binds to existing markup in bot-options.html:
// <aside id="leftdock"> … <input id="leftdockSearch"> <div id="channelsList"> <div id="rolesList">
import { BOT_BASE, gid } from './config.js';

const els = {
  dock: document.getElementById('leftdock'),
  search: document.getElementById('leftdockSearch'),
  channels: document.getElementById('channelsList'),
  roles: document.getElementById('rolesList'),
  editor: document.getElementById('editor'),
  channelsTitle: (document.getElementById('channelsList')?.previousElementSibling?.classList.contains('section-title')
    ? document.getElementById('channelsList').previousElementSibling : null),
  rolesTitle: (document.getElementById('rolesList')?.previousElementSibling?.classList.contains('section-title')
    ? document.getElementById('rolesList').previousElementSibling : null),
};

injectStyles(`
  #leftdock{align-self:start;}
  #leftdock .collapsible{cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none}
  #leftdock .chev{display:inline-block;transform:rotate(0deg);transition:transform .12s ease}
  #leftdock .collapsed .chev{transform:rotate(-90deg)}
  #leftdock .count{margin-left:auto;opacity:.7;font-size:11px}
  #leftdock .group-items{margin:2px 0 8px 0}
`);

console.group('[leftdock] init');
console.log('BOT_BASE', BOT_BASE);
console.log('guild_id', gid || '(missing)');
console.groupEnd();

ensureScrollableHeight();

if (!els.dock) console.warn('[leftdock] #leftdock not found');

setStatus('Init…', '#9aa3af');

(async function init(){
  if (!gid){
    setStatus('No guild_id in URL', '#fca5a5');
    console.error('[leftdock] missing guild_id');
    return;
  }

  makeSectionCollapsible(els.channelsTitle, els.channels, 'leftdock.section.channels');
  makeSectionCollapsible(els.rolesTitle, els.roles, 'leftdock.section.roles');

  const CHANNEL_URLS = [
    `${BOT_BASE}/runtime/guilds/${encodeURIComponent(gid)}/channels`,
    `${location.origin}/runtime/guilds/${encodeURIComponent(gid)}/channels`,
    `${location.origin}/api/runtime/guilds/${encodeURIComponent(gid)}/channels`,
  ];
  const ROLE_URLS = [
    `${BOT_BASE}/runtime/guilds/${encodeURIComponent(gid)}/roles`,
    `${location.origin}/runtime/guilds/${encodeURIComponent(gid)}/roles`,
    `${location.origin}/api/runtime/guilds/${encodeURIComponent(gid)}/roles`,
  ];

  let channels = [];
  let roles = [];

  try{
    console.group('[leftdock] fetch channels');
    const ch = await fetchFirstOk(CHANNEL_URLS, 'channels');
    console.table(ch.attempts);
    console.log('using', ch.url);
    channels = normalizeChannels(ch.data);
    console.log(`channels = ${channels.length}`);
    console.groupEnd();
  }catch(err){
    console.groupEnd();
    setStatus('Channels fetch failed', '#fca5a5');
    console.error('[leftdock] channels error', err);
    if (err.attempts) console.table(err.attempts);
    return;
  }

  try{
    console.group('[leftdock] fetch roles');
    const rl = await fetchFirstOk(ROLE_URLS, 'roles');
    console.table(rl.attempts);
    console.log('using', rl.url);
    roles = normalizeRoles(rl.data);
    console.log(`roles = ${roles.length}`);
    console.groupEnd();
  }catch(err){
    console.groupEnd();
    setStatus('Roles fetch failed', '#fca5a5');
    console.error('[leftdock] roles error', err);
    if (err.attempts) console.table(err.attempts);
    return;
  }

  renderChannels(channels);
  renderRoles(roles);
  wireSearch(channels, roles);

  updateSectionCount(els.channelsTitle, channels.length);
  updateSectionCount(els.rolesTitle, roles.length);

  console.log('%c[leftdock] success','color:#22c55e', { gid, channels: channels.length, roles: roles.length });
})();

/* ---------------- scrolling ---------------- */
function ensureScrollableHeight(){
  const h = els.editor?.getBoundingClientRect().height || Math.round(window.innerHeight * 0.68);
  if (els.dock){
    els.dock.style.maxHeight = `${h}px`;
    els.dock.style.overflow = 'auto';
    els.dock.style.height = `${h}px`; // fixed so it does not stretch downwards
  }
}
window.addEventListener('resize', ensureScrollableHeight);

/* ---------------- collapsible helpers ---------------- */
function makeSectionCollapsible(titleEl, contentEl, storageKey){
  if (!titleEl || !contentEl) return;
  if (titleEl.dataset.collapsible === '1') return;
  titleEl.dataset.collapsible = '1';
  titleEl.classList.add('collapsible');

  const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▾';
  const count = document.createElement('span'); count.className = 'count'; count.textContent = '';
  titleEl.appendChild(chev); titleEl.appendChild(count);

  const collapsed = localStorage.getItem(storageKey) === '1';
  setCollapsed(titleEl, contentEl, collapsed);

  titleEl.addEventListener('click', ()=>{
    const next = titleEl.classList.toggle('collapsed');
    contentEl.style.display = next ? 'none' : '';
    localStorage.setItem(storageKey, next ? '1' : '0');
  });
}

function updateSectionCount(titleEl, n){
  if (!titleEl) return;
  const c = titleEl.querySelector('.count'); if (c) c.textContent = String(n);
}

function setCollapsed(titleEl, contentEl, yes){
  if (yes) {
    titleEl.classList.add('collapsed');
    contentEl.style.display = 'none';
  } else {
    titleEl.classList.remove('collapsed');
    contentEl.style.display = '';
  }
}

function catHeader(text, key, count){
  const h = div('group-title', '');
  h.classList.add('collapsible');
  const chev = span('chev','▾');
  const label = document.createElement('span'); label.textContent = text;
  const cnt = span('count', String(count));
  h.append(chev, label, cnt);

  const collapsed = localStorage.getItem(key) === '1';
  if (collapsed) h.classList.add('collapsed');
  return h;
}

/* ---------------- network helpers ---------------- */
async function fetchFirstOk(urls, label){
  const attempts = [];
  for (const url of urls){
    try{
      const r = await fetch(url, { headers:{ Accept:'application/json' } });
      attempts.push({ url, status: r.status });
      if (!r.ok) continue;
      const data = await r.json().catch(()=> null);
      return { url, data: Array.isArray(data) ? data : [], attempts };
    }catch(e){
      attempts.push({ url, error: String(e && e.message || e) });
    }
  }
  const err = new Error(`All ${label} endpoints failed`);
  err.attempts = attempts;
  throw err;
}

/* ---------------- normalize ---------------- */
function normalizeChannels(arr){
  if (!Array.isArray(arr)) return [];
  return arr.map(c => {
    const type = Number(c.type);
    const typeOrder = ({ 4:0, 0:1, 2:2, 5:3, 10:4, 11:4, 12:4 })[type] ?? 9;
    return {
      id: String(c.id),
      name: String(c.name || 'unnamed'),
      parent_id: c.parent_id ? String(c.parent_id) : null,
      type, typeOrder,
      position: Number(c.position || 0),
    };
  }).sort((a,b) => (a.typeOrder - b.typeOrder) || (a.position - b.position) || a.name.localeCompare(b.name));
}

function normalizeRoles(arr){
  if (!Array.isArray(arr)) return [];
  return arr.map(r => ({
    id: String(r.id),
    name: String(r.name || '@unknown'),
    color: Number(r.color || 0),
    position: Number(r.position || 0),
    managed: !!r.managed,
  })).sort((a,b) => (b.position - a.position) || a.name.localeCompare(b.name));
}

/* ---------------- render ---------------- */
function renderChannels(list){
  if (!els.channels) return;
  els.channels.replaceChildren();

  // group by category
  const byCat = new Map();
  for (const c of list) if (c.type === 4) byCat.set(c.id, { cat:c, items:[] });
  for (const c of list){
    if (c.type === 4) continue;
    const g = c.parent_id && byCat.get(c.parent_id);
    if (g) g.items.push(c);
  }

  // render categories
  for (const { cat, items } of byCat.values()){
    const key = `leftdock.cat.${cat.id}`;
    const header = catHeader(`# ${cat.name}`, key, items.length);
    const container = div('group-items', '');
    for (const it of items) container.appendChild(channelItem(it));
    // restore collapsed
    if (localStorage.getItem(key) === '1'){ header.classList.add('collapsed'); container.style.display = 'none'; }
    header.addEventListener('click', ()=>{
      const next = header.classList.toggle('collapsed');
      container.style.display = next ? 'none' : '';
      localStorage.setItem(key, next ? '1' : '0');
    });
    els.channels.append(header, container);
  }

  // orphans
  const orphans = list.filter(c => c.type !== 4 && (!c.parent_id || !byCat.has(c.parent_id)));
  if (orphans.length){
    const key = `leftdock.cat.__uncategorized`;
    const header = catHeader('# Uncategorized', key, orphans.length);
    const container = div('group-items', '');
    for (const it of orphans) container.appendChild(channelItem(it));
    if (localStorage.getItem(key) === '1'){ header.classList.add('collapsed'); container.style.display = 'none'; }
    header.addEventListener('click', ()=>{
      const next = header.classList.toggle('collapsed');
      container.style.display = next ? 'none' : '';
      localStorage.setItem(key, next ? '1' : '0');
    });
    els.channels.append(header, container);
  }
}

function renderRoles(list){
  if (!els.roles) return;
  els.roles.replaceChildren();
  for (const r of list){
    const el = itemBase(r.name, r.id, 'role');
    if (r.color){
      const hex = '#' + r.color.toString(16).padStart(6,'0');
      const sw = span('pill', hex);
      sw.style.background = hex; sw.style.borderColor = '#0006'; sw.style.color = '#000';
      el.insertBefore(sw, el.firstChild);
    }
    els.roles.appendChild(el);
  }
}

function channelItem(c){
  const label = (c.type === 2) ? `🔊 ${c.name}` : `# ${c.name}`;
  const el = itemBase(label, c.id, 'channel');
  if (c.type === 4) el.classList.add('category');
  return el;
}

function itemBase(label, id, kind){
  const el = div('item'); el.draggable = true;
  el.dataset.id = id; el.dataset.kind = kind; el.title = `${label} — ${id}`;
  el.append(span('pill', kind), text(label));

  el.addEventListener('dragstart', (e)=>{
    el.classList.add('dragging');
    try{
      const nodeId = (kind === 'channel') ? 'get.channel' : 'get.role';
      e.dataTransfer.setData('text/x-node-id', nodeId);
      e.dataTransfer.setData('application/x-node-params', JSON.stringify({ id, kind }));
      e.dataTransfer.setData('text/plain', `${label} (${id})`);
    }catch{}
  });
  el.addEventListener('dragend', ()=> el.classList.remove('dragging'));

  el.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(id); }catch{} });
  return el;
}

/* ---------------- search ---------------- */
function wireSearch(channels, roles){
  if (!els.search) return;
  const idx = (arr) => arr.map(x => ({ k:(x.name||'').toLowerCase(), x }));
  const cIdx = idx(channels);
  const rIdx = idx(roles);
  els.search.addEventListener('input', ()=>{
    const q = els.search.value.trim().toLowerCase();
    const c = q ? cIdx.filter(e => e.k.includes(q)).map(e => e.x) : channels;
    const r = q ? rIdx.filter(e => e.k.includes(q)).map(e => e.x) : roles;
    renderChannels(c);
    renderRoles(r);
    updateSectionCount(els.channelsTitle, c.length);
    updateSectionCount(els.rolesTitle, r.length);
  });
}

/* ---------------- dom utils ---------------- */
function setStatus(msg, color){
  const mk = (t)=>{ const d=document.createElement('div'); d.className='subtle'; d.style.color=color; d.textContent=t; return d; };
  els.channels?.replaceChildren(mk(msg));
  els.roles?.replaceChildren(mk(msg));
}
function div(cls, text){ const d=document.createElement('div'); d.className=cls; if(text!=null)d.textContent=text; return d; }
function span(cls, text){ const s=document.createElement('span'); s.className=cls; s.textContent=text; return s; }
function text(t){ const s=document.createElement('span'); s.textContent=t; return s; }
function injectStyles(css){
  const id='leftdock-collapsible-style';
  if (document.getElementById(id)) return;
  const style=document.createElement('style'); style.id=id; style.textContent=css; document.head.appendChild(style);
}

/* ---------------- console helper ---------------- */
window.kadieLeftDockReload = async function(){
  console.info('[leftdock] manual reload');
  renderChannels([]); renderRoles([]);
  await (async ()=>{})();
};
