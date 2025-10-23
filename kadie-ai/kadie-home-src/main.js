import { printDiagnostics, OAUTH_URL } from '../api.js';
import { byId, setCSSVar } from './utils.js';
import { store } from './state.js';
import { showTab, wireTabClicks, getTabs } from './tabs.js';
import { preloadAuthFromCache, verifyAuthRefresh } from './auth.js';
import { startGpuStream, stopGpuStream } from './sse.js';
import { setServerBadge, exitServer } from './banner.js';
import { setCpuBar } from './progressbar.js';

printDiagnostics('kadie-home');

const headerEl = byId('siteHeader');
function updateHeaderHeight(){
  const h = Math.ceil(headerEl.getBoundingClientRect().height || 72);
  setCSSVar('--header-h', h + 'px');
}
new ResizeObserver(updateHeaderHeight).observe(headerEl);
window.addEventListener('resize', updateHeaderHeight);
updateHeaderHeight();

wireTabClicks();

// Wire the center Sign in button to the same OAuth URL used by the header.
const directBtn = document.getElementById('signinDirect');
if (directBtn) {
  directBtn.addEventListener('click', () => { location.href = OAUTH_URL; });
}

// iframe messages
window.addEventListener('message', (ev) => {
  if (!ev?.data || typeof ev.data !== 'object') return;
  const { type } = ev.data;

  if (type === 'openServer') {
    const { id, name, icon } = ev.data.guild || {};
    if (!id) return;
    store.selectedGuild = { id, name: name || '', icon: icon || '' };
    setServerBadge(store.selectedGuild);
    const q = new URLSearchParams({ guild_id:id, guild_name:name||'', guild_icon:icon||'' }).toString();
    const tabs = getTabs();
    tabs.simple.frame.src = `/kadie-ai/simple-server.html?${q}`;
    tabs.blueprints.frame.src = `/kadie-ai/blueprints-editor.html?${q}`;
    tabs.blueprints.btn.hidden = false;
    showTab('simple');
  }

  if (type === 'exitServer') exitServer();
  if (type === 'openBlueprints' && store.selectedGuild?.id) showTab('blueprints');

  // Legacy postMessage updates
  if (type === 'kadie:cpu') {
    const { current = 0, max = 0 } = ev.data;
    setCpuBar(current, max);
  }
});
window.addEventListener('beforeunload', stopGpuStream);

// boot
const hadCache = preloadAuthFromCache();
store.authUnknown = true;
showTab('simple');
verifyAuthRefresh();
