// /kadie-ai/bot-config.js
import { apiGet, ME_URL, GUILDS_URL, LOGOUT_URL, printDiagnostics } from '/assets/api.js';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');

printDiagnostics('bot-config.html');

function showError(msg, tip) {
  statusEl.classList.add('error');
  statusEl.innerHTML = `${msg}${tip ? `<br><span class="small">${tip}</span>` : ''}`;
}

function renderGuilds(guilds) {
  if (!Array.isArray(guilds) || guilds.length === 0) {
    statusEl.textContent = 'No servers returned.';
    return;
    }
  statusEl.textContent = `Loaded ${guilds.length} server(s).`;
  const frag = document.createDocumentFragment();
  guilds.forEach(g => {
    const div = document.createElement('div');
    div.className = 'item';
    const name = g.name ?? '(unnamed)';
    const id = g.id ?? '(no id)';
    const owner = g.owner ? 'owner' : '';
    const perms = g.permissions ?? '';
    div.innerHTML =
      `<strong>${name}</strong><div class="small">ID: ${id} ${owner}</div><div class="small">Perms: ${perms}</div>`;
    frag.appendChild(div);
  });
  listEl.replaceChildren(frag);
}

(async () => {
  try {
    // 1) Check session
    const meRes = await apiGet(ME_URL, 'GET /me');
    if (meRes.status === 401) {
      showError('Not logged in.',
        `Use <a href="/kadie-ai/kadie-ai.html">Sign in with Discord</a>. 
         If you *just* logged in and still see 401, confirm the Node service CORS allowlist includes <code>${location.origin}</code> and that cookies are not blocked.`);
      return;
    }
    if (!meRes.ok) {
      showError(`Unexpected /me status: ${meRes.status} ${meRes.statusText}`);
      return;
    }
    const me = await meRes.json();
    console.info('[SESSION] /me payload:', me);

    // 2) Load guilds
    const gRes = await apiGet(GUILDS_URL, 'GET /guilds');
    if (gRes.status === 401) {
      showError('Session expired. Re-authenticate.',
        `<a href="/kadie-ai/kadie-ai.html">Sign in</a>`);
      return;
    }
    if (!gRes.ok) {
      showError(`Failed to load guilds: ${gRes.status} ${gRes.statusText}`,
        gRes.status === 403 ? 'Missing "guilds" scope in Discord app or server denied.' : '');
      return;
    }
    const guilds = await gRes.json();
    console.info('[DATA] guilds:', guilds);
    renderGuilds(guilds);
  } catch (err) {
    console.error('[FATAL] bot-config error:', err);
    showError('Network or CORS error.',
      `Verify the Node service sets <code>Access-Control-Allow-Origin: ${location.origin}</code> and <code>Access-Control-Allow-Credentials: true</code>. Also confirm HTTPS and cookie policy.`);
  }
})();

// Optional logout helper (if Node exposes /logout)
window.logoutKadie = async function () {
  try {
    const res = await apiGet(LOGOUT_URL, 'GET /logout');
    console.info('[LOGOUT] status:', res.status);
    location.href = '/kadie-ai/kadie-ai.html';
  } catch (e) {
    console.error('[LOGOUT] error:', e);
  }
};
