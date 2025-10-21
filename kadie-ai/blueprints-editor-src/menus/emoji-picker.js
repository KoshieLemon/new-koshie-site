// /menus/emoji-picker.js
// Emoji picker with safe fallbacks. No local /assets fetch. Custom tab loads on demand.
// If /runtime/guilds/:gid/emojis 404s or is empty, Custom tab disables silently.

const MENU_ID = 'emoji-picker';

// ------------ CDN Unicode loader ------------
let UNICODE_CACHE = null;
async function loadUnicode() {
  if (UNICODE_CACHE) return UNICODE_CACHE;
  const cdn = 'https://cdn.jsdelivr.net/npm/emoji.json@13.1.0/emoji.json';
  try {
    const r = await fetch(cdn, { credentials: 'omit', cache: 'force-cache' });
    if (!r.ok) { UNICODE_CACHE = []; return UNICODE_CACHE; }
    const j = await r.json().catch(() => []);
    UNICODE_CACHE = Array.isArray(j)
      ? j.map(e => ({ char: e.char || e.emoji || '', name: e.name || e.description || '', keywords: e.keywords || [] }))
           .filter(x => x.char)
      : [];
  } catch {
    UNICODE_CACHE = [];
  }
  return UNICODE_CACHE;
}

// ------------ Custom emojis loader ------------
async function fetchCustomEmojis(guildId) {
  if (!guildId) return { ok: true, custom: [], disabled: true };
  try {
    const url = `/runtime/guilds/${encodeURIComponent(guildId)}/emojis`;
    const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return { ok: false, custom: [], disabled: true };
    const j = await r.json().catch(() => ({}));
    const arr = Array.isArray(j?.emojis?.custom) ? j.emojis.custom : [];
    return { ok: true, custom: arr, disabled: arr.length === 0 };
  } catch {
    return { ok: false, custom: [], disabled: true };
  }
}

// ------------ UI helpers ------------
function viewport() {
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  return { vw, vh };
}
function posNear(panel, anchor) {
  const ar = anchor.getBoundingClientRect();
  const { vw, vh } = viewport();
  const pad = 6;
  let x = ar.left, y = ar.bottom + pad;
  panel.style.position = 'fixed';
  panel.style.left = `${x}px`;
  panel.style.top  = `${y}px`;
  requestAnimationFrame(() => {
    const w = panel.offsetWidth || 360, h = panel.offsetHeight || 280;
    if (x + w > vw) x = Math.max(0, vw - w - pad);
    if (y + h > vh) y = Math.max(0, vh - h - pad);
    panel.style.left = `${x}px`;
    panel.style.top  = `${y}px`;
  });
}
function styleOnce() {
  if (document.getElementById('emoji-picker-styles')) return;
  const s = document.createElement('style');
  s.id = 'emoji-picker-styles';
  s.textContent = `
  .emoji-panel{background:#0a0f1a;border:1px solid #1f2937;border-radius:10px;box-shadow:0 10px 24px #000a;color:#e5e7eb;width:420px;max-height:420px;overflow:hidden;z-index:9999}
  .emoji-head{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #1f2937}
  .emoji-tabs{display:flex;gap:6px}
  .emoji-tabs button{background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:6px;padding:4px 8px;cursor:pointer}
  .emoji-tabs button[aria-selected="true"]{background:#1f2937}
  .emoji-tabs button:disabled{opacity:.45;cursor:not-allowed}
  .emoji-search{margin-left:auto}
  .emoji-search input{background:#0b1020;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:4px 8px;width:180px}
  .emoji-body{overflow:auto;max-height:340px;padding:8px}
  .emoji-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:6px}
  .emoji-item{display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;border:1px solid transparent;border-radius:8px;cursor:pointer;background:#0b1020}
  .emoji-item:hover{border-color:#334155;background:#111827}
  .emoji-item img{width:24px;height:24px;image-rendering:-webkit-optimize-contrast}
  .emoji-item span{font-size:20px;line-height:1}
  `;
  document.head.appendChild(s);
}

// ------------ Main ------------
export function openEmojiPicker({ anchor, guildId, onPick }) {
  styleOnce();

  // Close any existing
  const prev = document.getElementById('emoji-panel');
  if (prev) prev.remove();

  const panel = document.createElement('div');
  panel.id = 'emoji-panel';
  panel.className = 'emoji-panel';

  const head = document.createElement('div'); head.className = 'emoji-head';
  const tabs = document.createElement('div'); tabs.className = 'emoji-tabs';

  const tabUnicode = document.createElement('button');
  tabUnicode.type = 'button'; tabUnicode.textContent = 'Unicode'; tabUnicode.setAttribute('aria-selected','true');

  const tabCustom = document.createElement('button');
  tabCustom.type = 'button'; tabCustom.textContent = 'Custom';
  if (!guildId) tabCustom.disabled = true;

  const searchWrap = document.createElement('div'); searchWrap.className = 'emoji-search';
  const inputSearch = document.createElement('input'); inputSearch.type = 'search'; inputSearch.placeholder = 'Search…';
  searchWrap.appendChild(inputSearch);

  tabs.appendChild(tabUnicode); tabs.appendChild(tabCustom);
  head.appendChild(tabs); head.appendChild(searchWrap);

  const body = document.createElement('div'); body.className = 'emoji-body';
  const grid = document.createElement('div'); grid.className = 'emoji-grid';
  body.appendChild(grid);

  panel.appendChild(head); panel.appendChild(body);
  document.body.appendChild(panel);
  posNear(panel, anchor);

  function close() {
    try { panel.remove(); } catch {}
    window.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('keydown', onKey, true);
  }
  function onDocDown(e) { if (!panel.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  window.addEventListener('mousedown', onDocDown, true);
  window.addEventListener('keydown', onKey, true);

  let mode = 'unicode';
  let unicode = [];
  let custom = [];
  let customChecked = false;

  function render(list, kind) {
    grid.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.opacity = '.65';
      empty.style.padding = '8px';
      empty.textContent = kind === 'custom' ? 'No server emojis.' : 'No emojis.';
      grid.appendChild(empty);
      return;
    }
    for (const item of list) {
      const cell = document.createElement('button');
      cell.type = 'button'; cell.className = 'emoji-item';
      if (kind === 'custom') {
        const img = document.createElement('img');
        img.src = item.url; img.alt = item.name || 'emoji';
        cell.title = item.name || '';
        cell.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.textContent = item.char; cell.title = item.name || '';
        cell.appendChild(span);
      }
      cell.addEventListener('click', () => {
        if (typeof onPick === 'function') {
          if (kind === 'custom') {
            onPick({ type:'custom', id:item.id, name:item.name||null, animated:!!item.animated, url:item.url });
          } else {
            onPick({ type:'unicode', value:item.char, name:item.name||null });
          }
        }
        close();
      });
      grid.appendChild(cell);
    }
  }

  async function ensureUnicode() {
    if (!unicode.length) unicode = await loadUnicode();
  }

  async function ensureCustomOnce() {
    if (customChecked) return;
    customChecked = true;
    const res = await fetchCustomEmojis(guildId);
    custom = Array.isArray(res.custom) ? res.custom : [];
    if (res.disabled) {
      tabCustom.disabled = true;
      // stay on unicode if user tried to open custom and it isn't available
      if (mode === 'custom') { mode = 'unicode'; tabUnicode.setAttribute('aria-selected','true'); tabCustom.setAttribute('aria-selected','false'); }
    }
  }

  async function refresh() {
    const q = inputSearch.value.trim().toLowerCase();
    if (mode === 'unicode') {
      await ensureUnicode();
      let list = unicode;
      if (q) list = list.filter(e => (e.name && e.name.toLowerCase().includes(q)) || (Array.isArray(e.keywords) && e.keywords.some(k => String(k).toLowerCase().includes(q))) || (e.char && e.char.includes(q)));
      render(list.slice(0, 500), 'unicode');
    } else {
      await ensureCustomOnce();
      let list = custom;
      if (q) list = list.filter(e => (e.name && e.name.toLowerCase().includes(q)) || (e.id && String(e.id).includes(q)));
      render(list, 'custom');
    }
  }

  tabUnicode.addEventListener('click', () => {
    mode = 'unicode';
    tabUnicode.setAttribute('aria-selected','true');
    tabCustom.setAttribute('aria-selected','false');
    refresh();
  });
  tabCustom.addEventListener('click', async () => {
    if (tabCustom.disabled) return;
    mode = 'custom';
    tabUnicode.setAttribute('aria-selected','false');
    tabCustom.setAttribute('aria-selected','true');
    await refresh();
  });
  inputSearch.addEventListener('input', () => refresh());

  // Initial paint
  refresh();
}

// also expose on window for non-module callers
if (typeof window !== 'undefined') window.openEmojiPicker = openEmojiPicker;
