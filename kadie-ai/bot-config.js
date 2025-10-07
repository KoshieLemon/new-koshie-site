// /kadie-ai/bot-config.js
import { apiGet, apiGetFirst, ME_URL, GUILDS_URLS, LOGOUT_URL, printDiagnostics } from '/assets/api.js';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');

printDiagnostics('bot-config.html');

function showError(msg, tip) {
  statusEl.classList.add('error');
  statusEl.innerHTML = `${msg}${tip ? `<br><span class="small">${tip}</span>` : ''}`;
}

function renderGuilds(guilds, usedUrl) {
  statusEl.textContent = `Loaded ${guilds.length} server(s) from ${usedUrl}`;
  const frag = document.createDocumentFragment();
  guilds.forEach(g => {
    const div = document.createElement('div');
    div.className = 'item';
    const name = g.name ?? '(unnamed)';
    const id = g.id ?? '(no id)';
    const owner = g.owner ? 'owner' : '';
    const perms = g.permissions ?? '';
    div.innerHTML = `<strong>${name}</strong>
      <div class="small">ID: ${id} ${owner}</div>
      <div class="small">Perms: ${perms}</div>`;
    frag.appendChild(div);
  });
  listEl.replaceChildren(frag);
}

(async () => {
  try {
    // Session check
    const meRes = await apiGet(ME_URL, 'GET /me');
    if (meRes.status === 401) {
      showError('Not logged in.',
        `Use <a href="/kadie-ai/kadie-ai.html">Sign in with Discord</a>. Ensure CORS allows <code>${location.origin}</code>.`);
      return;
    }
    if (!meRes.ok) { showError(`Unexpected /me status: ${meRes.status} ${meRes.statusText}`); return; }
    const me = await meRes.json();
    console.info('[SESSION] /me:', me);

    // Guilds with fallback probing
    const { res: gRes, url: usedUrl } = await apiGetFirst(GUILDS_URLS, 'GET guilds');
    if (gRes.status === 401) { showError('Session expired. Re-authenticate.', `<a href="/kadie-ai/kadie-ai.html">Sign in</a>`); return; }
    if (!gRes.ok) { showError(`Failed to load guilds: ${gRes.status} ${gRes.statusText}`, `Tried ${GUILDS_URLS.map(u=>`<code>${u}</code>`).join(', ')}`); return; }
    const guilds = await gRes.json();
    console.info('[DATA] guilds from', usedUrl, guilds);
    if (!Array.isArray(guilds)) { showError('Guilds payload is not an array.', `Endpoint: <code>${usedUrl}</code>`); return; }
    renderGuilds(guilds, usedUrl);
  } catch (err) {
    console.error('[FATAL] bot-config error:', err, err?.attempts || '');
    const attemptsHtml = Array.isArray(err?.attempts)
      ? `<br>Attempts: ${err.attempts.map(a => `<code>${a.url}</code> (${a.status || a.error || 'error'})`).join(', ')}`
      : '';
    showError('Network or CORS error.', `Verify CORS + credentials on the Node service.${attemptsHtml}`);
  }
})();

window.logoutKadie = async function () {
  try {
    const res = await apiGet(LOGOUT_URL, 'GET /logout');
    console.info('[LOGOUT] status:', res.status);
    location.href = '/kadie-ai/kadie-ai.html';
  } catch (e) {
    console.error('[LOGOUT] error:', e);
  }
};
