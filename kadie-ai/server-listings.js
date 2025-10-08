// /kadie-ai/server-listings.js
import {
  IS_LOCAL,
  apiGet,
  apiGetFirst,
  ME_URL,
  GUILDS_URLS,
  fetchAppId,
  buildInviteUrl,
  fetchBotGuildSet,
  fetchGuildCounts,
  printDiagnostics
} from '/assets/api.js';

const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');

printDiagnostics('server-listings.html');

function setStatus(msg, isError = false) {
  if (!IS_LOCAL && !isError) { statusEl.classList.add('hidden'); return; }
  statusEl.classList.remove('hidden');
  statusEl.classList.toggle('error', isError);
  statusEl.innerHTML = msg;
}

function hasManagePerms(g) {
  const ADMIN = 1 << 3;      // 8
  const MANAGE_GUILD = 1 << 5; // 32
  const perms = Number(g.permissions || 0);
  return Boolean(g.owner || (perms & ADMIN) || (perms & MANAGE_GUILD));
}

function iconUrl(g) {
  return g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null;
}

function el(tag, cls, html) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (html != null) x.innerHTML = html;
  return x;
}

function renderCard(g, appId, isBotIn, manageable, counts) {
  const card = el('div', 'guild-card' + (manageable ? ' manageable' : ''), '');
  const head = el('div', 'guild-head', '');
  const img = el('div', 'guild-icon', '');
  const url = iconUrl(g);
  if (url) {
    const i = new Image(); i.src = url; i.className = 'guild-icon'; img.replaceWith(i);
    head.appendChild(i);
  } else {
    img.textContent = (g.name || '?').slice(0,1).toUpperCase();
    head.appendChild(img);
  }
  const titleBox = el('div', '', '');
  titleBox.appendChild(el('h3', 'guild-name', g.name ?? '(unnamed)'));
  const badgeRow = el('div', 'badges', '');
  if (manageable) badgeRow.appendChild(el('span', 'badge mgmt', 'manageable'));
  if (g.owner) badgeRow.appendChild(el('span', 'badge', 'owner'));
  titleBox.appendChild(badgeRow);
  head.appendChild(titleBox);
  card.appendChild(head);

  const meta = el('div', 'guild-meta', '');
  meta.appendChild(el('div', '', `ID: <span class="small">${g.id}</span>`));
  const countsEl = el('div', 'small', '');
  if (counts) {
    const parts = [];
    if (typeof counts.online === 'number') parts.push(`${counts.online} online`);
    if (typeof counts.total === 'number') parts.push(`${counts.total} members`);
    if (parts.length) countsEl.textContent = parts.join(' • ');
  }
  meta.appendChild(countsEl);
  card.appendChild(meta);

  const actions = el('div', 'actions', '');
  if (isBotIn) {
    const cfg = el('a', 'btn secondary', 'Manage bot');
    // pass icon/name/counts along for header rendering
    const q = new URLSearchParams({
      guild_id: g.id,
      guild_name: g.name || '',
      guild_icon: g.icon || '',
      total: counts?.total ?? '',
      online: counts?.online ?? ''
    }).toString();
    cfg.href = `/kadie-ai/bot-options.html?${q}`;
    actions.appendChild(cfg);
  } else {
    const add = el('a', 'btn', 'Add bot');
    if (appId && manageable) {
      add.href = buildInviteUrl(appId, g.id, 0);
      add.target = '_blank';
      actions.appendChild(add);
    } else {
      add.href = '#';
      add.setAttribute('aria-disabled', 'true');
      add.classList.add('disabled');
      add.textContent = manageable ? 'Add bot (app id missing)' : 'Insufficient perms';
      add.className = 'btn secondary';
      actions.appendChild(add);
    }
  }
  card.appendChild(actions);

  return card;
}

(async () => {
  try {
    // 1) session
    const meRes = await apiGet(ME_URL, 'GET /me');
    if (meRes.status === 401) {
      setStatus(`Not logged in. <a href="/kadie-ai/kadie-ai.html">Sign in with Discord</a>`, true);
      return;
    }
    if (!meRes.ok) { setStatus(`Unexpected /me: ${meRes.status}`, true); return; }

    // 2) guilds
    const { res: gRes, url: usedUrl } = await apiGetFirst(GUILDS_URLS, 'GET guilds');
    if (!gRes.ok) { setStatus(`Guilds error: ${gRes.status} ${gRes.statusText}`, true); return; }
    const guilds = await gRes.json();
    if (!Array.isArray(guilds)) { setStatus('Guilds payload invalid.', true); return; }
    if (IS_LOCAL) setStatus(`Loaded ${guilds.length} server(s) from ${usedUrl}`);

    // 3) helpers
    const [appId, botSet] = await Promise.all([fetchAppId(), fetchBotGuildSet()]);

    // 4) render with lazy count fetches
    const frag = document.createDocumentFragment();
    for (const g of guilds) {
      const manageable = hasManagePerms(g);
      const isBotIn = botSet ? botSet.has(String(g.id)) : false;
      // counts fetched per guild; if endpoint missing they’ll remain blank
      const counts = await fetchGuildCounts(g.id);
      frag.appendChild(renderCard(g, appId, isBotIn, manageable, counts || null));
    }
    gridEl.replaceChildren(frag);
  } catch (err) {
    const attemptsHtml = Array.isArray(err?.attempts)
      ? `<br>Attempts: ${err.attempts.map(a => `<code>${a.url}</code> (${a.status || a.error || 'error'})`).join(', ')}`
      : '';
    setStatus('Network or CORS error. ' + attemptsHtml, true);
    console.error('[server-listings] fatal', err);
  }
})();
