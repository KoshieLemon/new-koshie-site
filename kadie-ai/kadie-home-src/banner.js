import { byId } from './utils.js';
import { store } from './state.js';
import { startGpuStream, stopGpuStream } from './sse.js';
import { showTab, getTabs } from './tabs.js';

const serverBadge = byId('serverBadge');
const sbIcon = byId('sbIcon');
const sbName = byId('sbName');
const sbId   = byId('sbId');
const leaveBtn = byId('leaveServerBtn');

function updateBannerHeight(){
  const h = serverBadge.classList.contains('show') ? Math.ceil(serverBadge.getBoundingClientRect().height || 0) : 0;
  document.documentElement.style.setProperty('--banner-h', h + 'px');
}
new ResizeObserver(updateBannerHeight).observe(serverBadge);
window.addEventListener('resize', updateBannerHeight);

export function setServerBadge(guild){
  if (!guild) {
    stopGpuStream();
    serverBadge.classList.remove('show');
    sbIcon.removeAttribute('src');
    sbName.textContent=''; sbId.textContent='';
    updateBannerHeight(); return;
  }
  sbName.textContent = guild.name || 'Server';
  sbId.textContent   = guild.id ? `ID: ${guild.id}` : '';
  if (guild.icon && guild.id) sbIcon.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
  else sbIcon.removeAttribute('src');
  serverBadge.classList.add('show');
  updateBannerHeight();
  startGpuStream();
}
export function exitServer(){
  store.selectedGuild = null; setServerBadge(null);
  const tabs = getTabs();
  tabs.blueprints.btn.hidden = true;
  tabs.blueprints.frame.src = 'about:blank';
  tabs.simple.frame.src = `/kadie-ai/server-listings.html`;
  showTab('simple');
}
leaveBtn.addEventListener('click', exitServer);
