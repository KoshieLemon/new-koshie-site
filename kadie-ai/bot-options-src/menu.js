// bot-options-src/menu.js
// Collapsible, scrollable right-click node menu with live previews built via render.buildNodeDOM.
// Fix: clicking on folders/toggles no longer closes the menu.
// Update: added fuzzy search bar with live filtering and keyboard navigation.
import { els } from './dom.js';
import { fetchNodesIndex, groupNodesByCategory } from './nodes-index.js';
import { buildNodeDOM } from './render.js'

/* ---------- one-time style injection for the context menu ---------- */
(function injectCtxMenuStyles(){
  if (document.getElementById('ctx-menu-styles')) return;
  const s = document.createElement('style');
  s.id = 'ctx-menu-styles';
  s.textContent = `
  /* container */
  #ctx{
    position:absolute;
    min-width: 340px;
    max-width: 560px;
    background:#0b1020;
    border:1px solid #1f2937;
    border-radius:12px;
    padding:8px;
    box-shadow:0 12px 36px rgba(0,0,0,.45);
    color:#e5e7eb;
    display:none;
    overflow-y:auto;          /* scrollbar */
    overscroll-behavior: contain;
    z-index:9999;
    max-height: 70vh;
  }
  #ctx * { box-sizing:border-box; }

  /* search bar */
  #ctx .search{
    position: sticky;
    top: 0;
    z-index: 5;
    background: linear-gradient(#0b1020 0 70%, transparent 100%);
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid #111827;
  }
  #ctx .search .wrap{
    display:flex; gap:6px; align-items:center;
    background:#0a0f1a; border:1px solid #1f2937; border-radius:10px; padding:6px 8px;
  }
  #ctx .search input{
    flex:1; background:transparent; border:none; outline:none; color:#e5e7eb;
    font:500 13px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif;
  }
  #ctx .search .btn{
    background:#111827; border:1px solid #1f2937; color:#cbd5e1;
    font:600 11px/1 system-ui,Segoe UI,Roboto,Arial,sans-serif;
    padding:4px 8px; border-radius:8px; cursor:pointer;
  }
  #ctx .search .hint{
    margin-top:4px; color:#93a1b5; font:500 11px/1.1 system-ui,Segoe UI,Roboto,Arial,sans-serif;
  }

  /* collapsible folders */
  #ctx details{
    border:1px solid #111827;
    border-radius:10px;
    margin:6px 0;
    background:#0a0f1a;
  }
  #ctx summary{
    cursor:pointer;
    user-select:none;
    list-style:none;
    display:flex;
    align-items:center;
    gap:8px;
    padding:8px 10px;
    font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif;
    color:#cbd5e1;
    border-bottom:1px solid transparent;
  }
  #ctx summary::-webkit-details-marker{ display:none; }
  #ctx summary .chev{
    width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:8px solid #9ca3af;
    transition: transform .12s ease;
  }
  #ctx details[open] summary .chev{ transform: rotate(90deg); }
  #ctx .folder-body{ padding:8px; display:grid; gap:8px; }

  /* preview items */
  #ctx .preview-item{
    background:#0b1224;
    border:1px solid #1f2937;
    border-radius:10px;
    padding:6px;
    cursor:pointer;
    outline:none;
  }
  #ctx .preview-item:focus-visible{ outline:2px solid #60a5fa; }
  #ctx .preview-item:hover{ background:#0b142a; }
  #ctx .preview-item.active{ box-shadow:0 0 0 2px #3b82f6aa inset; }
  #ctx .preview-item .hint{
    margin-top:4px;
    font:500 11px/1.1 system-ui,Segoe UI,Roboto,Arial,sans-serif;
    color:#93a1b5;
    word-break: break-all;
  }

  /* shrink preview node; keep exact structure so it matches graph nodes */
  #ctx .preview-item .node{
    position:relative; /* fixed for scaling inside menu */
    transform: scale(.85);
    transform-origin: top left;
    pointer-events: none; /* avoid interacting with inputs inside preview */
  }

  /* generic menu item style fallback */
  #ctx .menu-item{ padding:6px 8px; border-radius:8px; }

  /* search results */
  #ctx .results{ display:none; }
  #ctx .results.grid{ display:grid; gap:8px; }
  #ctx .no-results{
    padding:10px; color:#9ca3af; font:500 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif;
    border:1px dashed #1f2937; border-radius:10px; background:#0a0f1a;
  }
  `;
  document.head.appendChild(s);
})();

/* ---------- fuzzy matching helpers ---------- */
function normalize(s){ return String(s||'').toLowerCase().trim(); }
function subseqSim(str, pat){
  // simple subsequence similarity: matched chars / pat.length
  let i=0, j=0, m=0;
  while (i<str.length && j<pat.length){
    if (str[i]===pat[j]){ m++; j++; }
    i++;
  }
  return pat.length ? m / pat.length : 1;
}
function levenshtein(a, b){
  a = normalize(a); b = normalize(b);
  const n=a.length, m=b.length;
  if (!n) return m;
  if (!m) return n;
  const dp = new Array(m+1);
  for (let j=0;j<=m;j++) dp[j]=j;
  for (let i=1;i<=n;i++){
    let prev = dp[0], tmp;
    dp[0]=i;
    for (let j=1;j<=m;j++){
      tmp = dp[j];
      if (a[i-1]===b[j-1]) dp[j]=prev;
      else dp[j]=1+Math.min(prev, dp[j-1], dp[j]); // sub, ins, del
      prev = tmp;
    }
  }
  return dp[m];
}
function scoreDef(def, q){
  const name = normalize(def.name);
  const id   = normalize(def.id);
  const cat  = normalize(def.category || '');
  const key  = `${name} ${id} ${cat}`;
  const inc  = key.includes(q) ? 1 : 0;
  const starts = name.startsWith(q) ? 1 : 0;
  const lev = levenshtein(name, q);
  const levSim = 1 - lev / Math.max(name.length, q.length, 1);
  const sub = subseqSim(name, q);
  // weighted score [0..1+] with small boosts for prefix/includes
  return Math.max(0, 0.65*levSim + 0.30*sub + 0.05*inc + 0.05*starts);
}
function rankMatches(nodes, query, limit=200){
  const q = normalize(query);
  if (!q) return [];
  const scored = nodes.map(def => ({ def, s: scoreDef(def, q) }));
  scored.sort((a,b)=>{
    if (b.s!==a.s) return b.s - a.s;
    return a.def.name.localeCompare(b.def.name);
  });
  // threshold: keep reasonable matches only
  const best = scored.filter(x => x.s >= 0.35).slice(0, limit);
  return best.map(x => x.def);
}

/* ---------- public API ---------- */
export async function openContextMenu(screenX, screenY, onChoose){
  const idx = await fetchNodesIndex();
  const list = idx.nodes || [];
  const tree = groupNodesByCategory(list);

  // attach to editor and position exactly at cursor within it
  if (els.ctxMenu.parentElement !== els.editor) els.editor.appendChild(els.ctxMenu);
  const er = els.editor.getBoundingClientRect();
  const localX = screenX - er.left;
  const localY = screenY - er.top;

  els.ctxMenu.style.maxHeight = Math.floor(er.height * 0.8) + 'px';
  els.ctxMenu.style.left = localX + 'px';
  els.ctxMenu.style.top  = localY + 'px';
  els.ctxMenu.innerHTML = '';

  // prevent outside-click close when interacting inside the menu
  els.ctxMenu.addEventListener('click', stop, { once:true, capture:true });
  els.ctxMenu.addEventListener('mousedown', stop, { once:true, capture:true });

  // search UI
  const { searchWrap, input, clearBtn, resultsEl, treeWrap } =
    buildSearchableUI(els.ctxMenu);

  // build collapsible tree (collapsed by default)
  buildTreeCollapsible(treeWrap, tree, onChoose);

  els.ctxMenu.style.display = 'block';

  // clamp inside editor after layout
  requestAnimationFrame(()=>{
    const mw = els.ctxMenu.offsetWidth  || 0;
    const mh = els.ctxMenu.offsetHeight || 0;
    let lx = localX, ly = localY;
    if (lx + mw > er.width)  lx = Math.max(0, er.width  - mw - 8);
    if (ly + mh > er.height) ly = Math.max(0, er.height - mh - 8);
    els.ctxMenu.style.left = `${lx}px`;
    els.ctxMenu.style.top  = `${ly}px`;
    input.focus();
    input.select();
  });

  // filtering behavior
  let activeIdx = -1;
  function updateActive(listEls){
    listEls.forEach(el => el.classList.remove('active'));
    if (activeIdx >= 0 && activeIdx < listEls.length){
      listEls[activeIdx].classList.add('active');
      listEls[activeIdx].scrollIntoView({ block:'nearest' });
    }
  }

  const doFilter = (value)=>{
    const q = value.trim();
    if (!q){
      resultsEl.style.display = 'none';
      treeWrap.style.display = '';
      resultsEl.innerHTML = '';
      activeIdx = -1;
      return;
    }
    const matches = rankMatches(list, q, 300);
    resultsEl.innerHTML = '';
    if (matches.length === 0){
      const none = document.createElement('div');
      none.className = 'no-results';
      none.textContent = 'No matching nodes.';
      resultsEl.appendChild(none);
    } else {
      for (const def of matches){
        resultsEl.appendChild(buildPreviewItem(def, onChoose));
      }
    }
    resultsEl.style.display = 'grid';
    treeWrap.style.display = 'none';
    activeIdx = matches.length ? 0 : -1;
    updateActive([...resultsEl.querySelectorAll('.preview-item')]);
  };

  let t=null;
  input.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(()=> doFilter(input.value), 80);
  });
  clearBtn.addEventListener('click', ()=>{
    input.value = '';
    doFilter('');
    input.focus();
  });

  // keyboard nav
  input.addEventListener('keydown', (e)=>{
    const items = [...resultsEl.querySelectorAll('.preview-item')];
    if (e.key === 'ArrowDown' && items.length){
      e.preventDefault();
      activeIdx = Math.min(items.length - 1, activeIdx + 1);
      updateActive(items);
    } else if (e.key === 'ArrowUp' && items.length){
      e.preventDefault();
      activeIdx = Math.max(0, activeIdx - 1);
      updateActive(items);
    } else if (e.key === 'Enter'){
      e.preventDefault();
      const chosen = (items[activeIdx] || items[0]);
      if (chosen){
        const id = chosen.getAttribute('data-id');
        if (id){ onChoose(id); hideOnce(); }
      }
    }
  });

  // close only if the click is outside
  const onDocPointer = (ev)=>{
    const inside = ev.composedPath().includes(els.ctxMenu);
    if (!inside) hideOnce();
  };
  window.addEventListener('pointerdown', onDocPointer, { once:true });
  window.addEventListener('keydown', escToClose, { once:true });

  function stop(e){ e.stopPropagation(); }
}

function hideOnce(){ const el = document.getElementById('ctx'); if (el?.style) el.style.display='none'; }
function escToClose(e){ if (e.key === 'Escape') hideOnce(); }

/* ---------- search UI builder ---------- */
function buildSearchableUI(root){
  const search = document.createElement('div');
  search.className = 'search';

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search nodes… (name, id, or category)';
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label','Search nodes');

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear';

  wrap.appendChild(input);
  wrap.appendChild(clearBtn);
  search.appendChild(wrap);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Tip: Use arrow keys and Enter. Typo-tolerant search.';
  search.appendChild(hint);

  const results = document.createElement('div');
  results.className = 'results grid';

  const treeWrap = document.createElement('div');
  treeWrap.className = 'tree';

  root.appendChild(search);
  root.appendChild(results);
  root.appendChild(treeWrap);

  return { searchWrap: search, input, clearBtn, resultsEl: results, treeWrap };
}

/* ---------- collapsible tree ---------- */
function buildTreeCollapsible(rootEl, grouped, onChoose){
  for (const [key, val] of Object.entries(grouped)){
    if (key === '__leaf') continue;

    if (val.__leaf){
      rootEl.appendChild(buildPreviewItem(val.__leaf, onChoose));
    } else {
      const details = document.createElement('details'); // collapsed by default
      const summary = document.createElement('summary');
      const chev = document.createElement('span'); chev.className = 'chev';
      const label = document.createElement('span'); label.textContent = key;
      summary.appendChild(chev); summary.appendChild(label);
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'folder-body';
      buildTreeCollapsible(body, val, onChoose);
      details.appendChild(body);

      rootEl.appendChild(details);
    }
  }
}

/* ---------- item with preview (uses render.buildNodeDOM) ---------- */
function buildPreviewItem(def, onChoose){
  const outer = document.createElement('div');
  outer.className = 'preview-item';
  outer.tabIndex = 0;
  outer.setAttribute('draggable', 'true');
  outer.setAttribute('data-id', def.id);

  outer.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('text/x-node-id', def.id);
  });
  outer.addEventListener('click', ()=>{
    onChoose(def.id);
    hideOnce();
  });

  // Build preview node via universal renderer
  const nodeEl = buildNodeDOM(def, { preview:true, nid: null, params:{} });
  outer.appendChild(nodeEl);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = def.id;
  outer.appendChild(hint);

  return outer;
}
