// /kadie-ai/kadie-home.js
// Adds user dropdown on avatar with Liked, Bookmarked, Notifications.
// Orange dot shows when unread notifications exist.

import { OAUTH_URL, ME_URL, apiGet, printDiagnostics } from './api.js';
printDiagnostics('kadie-home');

function byId(id){ return document.getElementById(id); }
const API_BASE = new URL(ME_URL, location.href).origin;

/* tabs + elements */
const tabs = {
  simple:     { btn: byId('tab-simple'),     frame: byId('frame-simple') },
  community:  { btn: byId('tab-community'),  frame: byId('frame-community') },
  blueprints: { btn: byId('tab-blueprints'), frame: byId('frame-blueprints') },
  nodes:      { btn: byId('tab-nodes'),      frame: byId('frame-nodes') },
  tutorials:  { btn: byId('tab-tutorials'),  frame: byId('frame-tutorials') },
  status:     { btn: byId('tab-status'),     frame: byId('frame-status') },
};
const authBlock   = byId('authBlock');
const authStatus  = byId('authStatus');
const signinBtn   = byId('signinDirect');
const serverBadge = byId('serverBadge');
const sbIcon      = byId('sbIcon');
const sbName      = byId('sbName');
const sbId        = byId('sbId');
const leaveBtn    = byId('leaveServerBtn');
const headerEl    = byId('siteHeader');

/* header height -> viewport */
const ro = new ResizeObserver(updateHeaderHeight);
window.addEventListener('resize', updateHeaderHeight);
ro.observe(headerEl);
updateHeaderHeight();
function updateHeaderHeight(){
  const h = Math.ceil(headerEl.getBoundingClientRect().height || 72);
  document.documentElement.style.setProperty('--header-h', h + 'px');
}

/* user pill + dropdown */
function ensureUserStyles(){
  if (byId('kadie-userpill-style')) return;
  const style = document.createElement('style');
  style.id = 'kadie-userpill-style';
  style.textContent = `
    #kadieUser { margin-left:auto; display:flex; align-items:center; position:relative; }
    .kadie-userwrap{ display:flex; align-items:center; gap:10px; cursor:pointer; position:relative; }
    .kadie-avatar{ width:28px; height:28px; border-radius:999px; object-fit:cover;
                   background:#0e1218; border:1px solid #1f2432; }
    .kadie-dot{ position:absolute; right:-2px; top:-2px; width:10px; height:10px; border-radius:50%;
                background:#ff8a00; border:2px solid #0b0b0c; display:none; }
    .kadie-dot.show{ display:block; }
    .btn{border:1px solid #2b2f3a;background:#11131a;color:#eaeaea;padding:7px 10px;border-radius:10px;cursor:pointer;text-decoration:none;font-size:13px}

    .kadie-menu{ position:absolute; right:0; top:40px; width:360px; max-height:70vh; overflow:auto;
                 background:#0e1116; border:1px solid #2b2f3a; border-radius:12px; display:none; z-index:9999;
                 box-shadow:0 12px 24px #000a; }
    .kadie-menu.show{ display:block; }
    .km-head{ display:flex; gap:6px; padding:8px; border-bottom:1px solid #1a1f2b; position:sticky; top:0; background:#0e1116; }
    .km-tab{ flex:1; padding:8px; border:1px solid #2b2f3a; background:#11131a; color:#eaeaea; border-radius:8px; cursor:pointer; text-align:center; }
    .km-tab.active{ outline:2px solid #5ac8fa; }
    .km-body{ padding:8px; display:flex; flex-direction:column; gap:8px; }
    .km-item{ border:1px solid #1f2635; background:#0c1018; border-radius:10px; padding:8px; }
    .km-meta{ font-size:12px; color:#9aa4b2; margin-top:4px }
    .km-empty{ color:#9aa4b2; text-align:center; padding:16px }
  `;
  document.head.appendChild(style);
}
function ensureUserPill(){
  ensureUserStyles();
  let el = byId('kadieUser');
  if (!el) { el = document.createElement('div'); el.id = 'kadieUser'; headerEl.appendChild(el); }
  return el;
}
const avatarUrl = (u) => (u?.sub && u?.avatar) ? `https://cdn.discordapp.com/avatars/${u.sub}/${u.avatar}.png?size=64` : null;

let userState = { user: null, profile: null, unread: 0 };
let dropdown = null, dot = null;

function renderSignedOut(container){
  container.innerHTML = '';
  const a = document.createElement('a'); a.href = OAUTH_URL; a.className = 'btn'; a.textContent = 'Sign in';
  container.appendChild(a);
}
function renderSignedIn(container, user){
  container.innerHTML = '';

  const wrap = document.createElement('div'); wrap.className = 'kadie-userwrap'; wrap.setAttribute('role','button'); wrap.setAttribute('tabindex','0');
  const img = document.createElement('img'); img.className = 'kadie-avatar'; img.alt = user?.username || 'profile';
  const url = avatarUrl(user); if (url) img.src = url;
  dot = document.createElement('span'); dot.className = 'kadie-dot'; dot.id = 'kadieNotifDot';
  wrap.appendChild(img); wrap.appendChild(dot);
  container.appendChild(wrap);

  dropdown = document.createElement('div'); dropdown.className = 'kadie-menu'; dropdown.id = 'kadieUserMenu';
  dropdown.innerHTML = `
    <div class="km-head">
      <button class="km-tab" data-tab="liked">Liked</button>
      <button class="km-tab" data-tab="bookmarked">Bookmarked</button>
      <button class="km-tab" data-tab="notifications">Notifications</button>
    </div>
    <div class="km-body" id="kmBody"><div class="km-empty">Select a tab.</div></div>
  `;
  container.appendChild(dropdown);

  const toggle = () => { dropdown.classList.toggle('show'); if (dropdown.classList.contains('show')) selectTab('notifications'); };
  wrap.onclick = toggle;
  wrap.onkeydown = (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };

  document.addEventListener('click', (ev) => {
    if (!dropdown) return;
    const inside = container.contains(ev.target);
    if (!inside) dropdown.classList.remove('show');
  });
  dropdown.querySelectorAll('.km-tab').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));
}

function setDot(on){ if (!dot) return; dot.classList.toggle('show', !!on); }

/* fetch helpers */
async function getMemberSummary(){
  const r = await fetch(`${API_BASE}/forums/me`, { credentials:'include' });
  if (!r.ok) return { profile: null, unreadCount: 0 };
  return r.json();
}
async function getPostsByIds(ids){
  if (!ids.length) return [];
  const r = await fetch(`${API_BASE}/forums/posts/byIds?ids=${encodeURIComponent(ids.join(','))}`, { credentials:'include' });
  if (!r.ok) return [];
  const j = await r.json().catch(()=>({items:[]}));
  return Array.isArray(j.items) ? j.items : [];
}
async function getNotifications(limit=50){
  const r = await fetch(`${API_BASE}/forums/notifications?limit=${limit}`, { credentials:'include' });
  if (!r.ok) return [];
  const j = await r.json().catch(()=>({items:[]}));
  return Array.isArray(j.items) ? j.items : [];
}
async function markNotificationsRead(){
  await fetch(`${API_BASE}/forums/notifications/read`, { method:'POST', credentials:'include' });
}

/* tab renderer */
async function selectTab(key){
  if (!dropdown) return;
  dropdown.querySelectorAll('.km-tab').forEach(b => b.classList.remove('active'));
  const activeBtn = dropdown.querySelector(`.km-tab[data-tab="${key}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const body = byId('kmBody');
  body.innerHTML = '<div class="km-empty">Loading…</div>';

  if (key === 'liked' || key === 'bookmarked') {
    const ids = (key === 'liked' ? (userState.profile?.likedPostIds || []) : (userState.profile?.bookmarkedPostIds || []));
    const posts = await getPostsByIds(ids.slice(-50).reverse());
    if (!posts.length) { body.innerHTML = '<div class="km-empty">None yet.</div>'; return; }
    body.innerHTML = '';
    posts.forEach(p => {
      const d = document.createElement('div'); d.className = 'km-item';
      d.innerHTML = `
        <div>${(p.content || '').toString().slice(0, 140)}</div>
        <div class="km-meta">by ${p.authorName || 'user'} • ${new Date(p.createdAt||Date.now()).toLocaleString()}</div>
        <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end">
          <button class="btn" data-thread="${p.threadId}">Open</button>
        </div>`;
      d.querySelector('.btn').onclick = () => { if (tabs.community?.btn) tabs.community.btn.hidden = false; showTab('community'); };
      body.appendChild(d);
    });
    return;
  }

  if (key === 'notifications') {
    const items = await getNotifications(50);
    body.innerHTML = '';
    if (!items.length) { body.innerHTML = '<div class="km-empty">No notifications.</div>'; }
    items.forEach(n => {
      const d = document.createElement('div'); d.className = 'km-item';
      d.innerHTML = `
        <div>${n.message || '(notification)'}</div>
        <div class="km-meta">${new Date(n.createdAt||Date.now()).toLocaleString()}</div>`;
      body.appendChild(d);
    });
    // mark as read, clear dot
    await markNotificationsRead().catch(()=>{});
    setDot(false);
  }
}

/* tab controls */
Object.entries(tabs).forEach(([key, { btn }]) => btn && btn.addEventListener('click', () => showTab(key)));
function showTab(key){
  const target = tabs[key];
  if (!target) return;
  for (const t of Object.values(tabs)) {
    if (t.btn)   t.btn.classList.remove('active');
    if (t.frame) t.frame.classList.remove('active');
  }
  if (target.btn)   target.btn.classList.add('active');
  if (target.frame) target.frame.classList.add('active');
}

/* server badge + routing */
let selectedGuild = null;
function setServerBadge(guild){
  if (!guild) {
    serverBadge.classList.remove('show'); sbIcon.removeAttribute('src'); sbName.textContent=''; sbId.textContent=''; return;
  }
  sbName.textContent = guild.name || 'Server';
  sbId.textContent   = guild.id ? `ID: ${guild.id}` : '';
  if (guild.icon && guild.id) sbIcon.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
  else sbIcon.removeAttribute('src');
  serverBadge.classList.add('show');
}
function exitServer(){
  selectedGuild = null; setServerBadge(null);
  tabs.blueprints.btn.hidden = true;
  tabs.blueprints.frame.src = 'about:blank';
  tabs.simple.frame.src = `/kadie-ai/server-listings.html`;
  showTab('simple');
}
leaveBtn.addEventListener('click', exitServer);

/* auth + user pill */
signinBtn.addEventListener('click', () => { location.href = OAUTH_URL; });
async function tryAuthGate(){
  const userSlot = ensureUserPill();
  try{
    const res = await apiGet(ME_URL, 'GET /me (kadie-home)');
    if (res.ok){
      const data = await res.json().catch(()=>null);
      const user = data?.user || null;
      authBlock.classList.remove('show');
      tabs.community.btn.hidden = false;
      authStatus.textContent = 'Signed in.';
      renderSignedIn(userSlot, user);
      userState.user = user;

      const summary = await getMemberSummary().catch(()=>({profile:null, unreadCount:0}));
      userState.profile = summary.profile;
      userState.unread = Number(summary.unreadCount || 0);
      setDot(userState.unread > 0);
    } else {
      authBlock.classList.add('show');
      tabs.community.btn.hidden = true;
      authStatus.textContent = 'Not signed in.';
      renderSignedOut(userSlot);
      userState = { user:null, profile:null, unread:0 };
      setDot(false);
    }
  } catch {
    authStatus.textContent = 'Network error. Try again.';
    authBlock.classList.add('show');
    tabs.community.btn.hidden = true;
    renderSignedOut(userSlot);
    userState = { user:null, profile:null, unread:0 };
    setDot(false);
  }
}

/* iframe messages */
window.addEventListener('message', (ev) => {
  if (!ev?.data || typeof ev.data !== 'object') return;
  const { type } = ev.data;
  if (type === 'openServer') {
    const { id, name, icon } = ev.data.guild || {};
    if (!id) return;
    selectedGuild = { id, name: name || '', icon: icon || '' };
    setServerBadge(selectedGuild);
    const q = new URLSearchParams({ guild_id:id, guild_name:name||'', guild_icon:icon||'' }).toString();
    tabs.simple.frame.src = `/kadie-ai/simple-server.html?${q}`;
    tabs.blueprints.frame.src = `/kadie-ai/blueprints-editor.html?${q}`;
    tabs.blueprints.btn.hidden = false;
    showTab('simple');
  }
  if (type === 'exitServer') exitServer();
  if (type === 'openBlueprints' && selectedGuild?.id) showTab('blueprints');
});

/* boot */
showTab('simple');
tryAuthGate();
