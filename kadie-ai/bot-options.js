// /kadie-ai/bot-options.js
import { printDiagnostics } from '/assets/api.js';

printDiagnostics('bot-options.html');

function get(q) { return new URLSearchParams(location.search).get(q) || ''; }

const gid = get('guild_id');
const gname = decodeURIComponent(get('guild_name'));

document.getElementById('title').textContent = gname ? `Bot Options • ${gname}` : 'Bot Options';
document.getElementById('content').innerHTML = `
  <div class="small">Guild ID: <code>${gid || '(unknown)'}</code></div>
  <p style="margin-top:10px">Configure features here.</p>
`;
