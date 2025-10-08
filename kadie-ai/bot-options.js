// /kadie-ai/bot-options.js
import { fetchGuildCounts, printDiagnostics } from '/assets/api.js';

printDiagnostics('bot-options.html');

function qp(name){ return new URLSearchParams(location.search).get(name) || ''; }

const gid   = qp('guild_id');
const gname = decodeURIComponent(qp('guild_name'));
const gicon = qp('guild_icon');
const totalQ = qp('total');
const onlineQ = qp('online');

const nameEl = document.getElementById('gname');
const metaEl = document.getElementById('gmeta');
const iconEl = document.getElementById('gicon');

nameEl.textContent = gname || '(unnamed)';
if (gicon) {
  iconEl.src = `https://cdn.discordapp.com/icons/${gid}/${gicon}.png?size=128`;
  iconEl.alt = gname || 'icon';
} else {
  iconEl.removeAttribute('src');
}

async function setMeta() {
  let total = totalQ ? Number(totalQ) : null;
  let online = onlineQ ? Number(onlineQ) : null;

  if (total == null || isNaN(total) || online == null || isNaN(online)) {
    const c = gid ? await fetchGuildCounts(gid) : null;
    total = c?.total ?? total;
    online = c?.online ?? online;
  }
  const parts = [`ID: ${gid || '(unknown)'}`];
  if (typeof online === 'number') parts.push(`${online} online`);
  if (typeof total === 'number') parts.push(`${total} members`);
  metaEl.textContent = parts.join(' • ');
}
setMeta();
