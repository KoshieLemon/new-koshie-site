// /kadie-ai/kadie-home.js
import { OAUTH_URL, ME_URL, apiGet, printDiagnostics } from './api.js';
printDiagnostics('kadie-home');

function byId(id){ return document.getElementById(id); }

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

/* user pill */
function ensureUserStyles(){
  if (byId('kadie-userpill-style')) return;
  const style = document.createElement('style');
  style.id = 'kadie-userpill-style';
  style.textContent = `
    #kadieUser { display:flex; align-items:center; margin-left:12px; }
    .kadie-userwrap{ display:flex; align-items:center; gap:10px; }
    .kadie-avatar{ width:28px; height:28px; border-radius:999px; object-fit:cover;
                   background:#0e1218; border:1px solid #1f2432; }
    .btn{border:1px solid #2b2f3a;background:#11131a;color:#eaeaea;padding:7px 10px;border-radius:10px;cursor:pointer;text-decoration:none;font-size:13px}
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
function renderSignedOut(container){
  container.innerHTML = '';
  const a = document.createElement('a'); a.href = OAUTH_URL; a.className = 'btn'; a.textContent = 'Sign in';
  container.appendChild(a);
}
function renderSignedIn(container, user){
  container.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'kadie-userwrap';
  const img = document.createElement('img'); img.className = 'kadie-avatar'; img.alt = user?.username || 'profile';
  const url = avatarUrl(user); if (url) img.src = url;
  wrap.appendChild(img); container.appendChild(wrap);
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
    } else {
      authBlock.classList.add('show');
      tabs.community.btn.hidden = true;
      authStatus.textContent = 'Not signed in.';
      renderSignedOut(userSlot);
    }
  } catch {
    authStatus.textContent = 'Network error. Try again.';
    authBlock.classList.add('show');
    tabs.community.btn.hidden = true;
    renderSignedOut(userSlot);
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
