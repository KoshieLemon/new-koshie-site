import { OAUTH_URL, ME_URL, apiGet, printDiagnostics } from '/assets/api.js';

printDiagnostics('kadie-home');

const tabs = {
  simple:      { btn: byId('tab-simple'),      frame: byId('frame-simple') },
  community:   { btn: byId('tab-community'),   frame: byId('frame-community') },
  blueprints:  { btn: byId('tab-blueprints'),  frame: byId('frame-blueprints') },
};

const authBlock   = byId('authBlock');
const authStatus  = byId('authStatus');
const signinBtn   = byId('signinDirect');

const serverBadge = byId('serverBadge');
const sbIcon      = byId('sbIcon');
const sbName      = byId('sbName');
const sbId        = byId('sbId');
const leaveBtn    = byId('leaveServerBtn');

let selectedGuild = null;

/* dynamic height under header */
const headerEl = document.getElementById('siteHeader');
const ro = new ResizeObserver(updateHeaderHeight);
window.addEventListener('resize', updateHeaderHeight);
ro.observe(headerEl);
updateHeaderHeight();
function updateHeaderHeight(){
  const h = Math.ceil(headerEl.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--header-h', h + 'px');
}

signinBtn.addEventListener('click', () => { location.href = OAUTH_URL; });

Object.entries(tabs).forEach(([key, { btn }]) => {
  btn.addEventListener('click', () => showTab(key));
});
leaveBtn.addEventListener('click', exitServer);

function showTab(key) {
  for (const { btn } of Object.values(tabs)) btn.classList.remove('active');
  tabs[key].btn.classList.add('active');
  for (const { frame } of Object.values(tabs)) frame.classList.remove('active');
  tabs[key].frame.classList.add('active');
}

function setServerBadge(guild) {
  if (!guild) {
    serverBadge.classList.remove('show'); sbIcon.removeAttribute('src');
    sbName.textContent = ''; sbId.textContent = ''; return;
  }
  sbName.textContent = guild.name || 'Server';
  sbId.textContent   = guild.id ? `ID: ${guild.id}` : '';
  if (guild.icon && guild.id) sbIcon.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
  else sbIcon.removeAttribute('src');
  serverBadge.classList.add('show');
}

async function tryAuthGate() {
  try {
    const res = await apiGet(ME_URL, 'GET /me (kadie-home)');
    const ok = res.ok;
    authBlock.classList.toggle('show', !ok);
    tabs.community.btn.hidden = !ok;
    authStatus.textContent = ok ? 'Signed in.' : 'Not signed in.';
    return ok;
  } catch {
    authStatus.textContent = 'Network error. Try again.';
    authBlock.classList.add('show');
    tabs.community.btn.hidden = true;
    return false;
  }
}

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
  if (type === 'openBlueprints') { if (selectedGuild?.id) showTab('blueprints'); }
});

function exitServer() {
  selectedGuild = null; setServerBadge(null);
  tabs.blueprints.btn.hidden = true;
  tabs.blueprints.frame.src = 'about:blank';
  tabs.simple.frame.src = `/kadie-ai/server-listings.html`;
  showTab('simple');
}

function byId(id){ return document.getElementById(id); }
tryAuthGate();
