// bot-options-src/menu.js
// Collapsible, scrollable right-click node menu with live previews built via render.buildNodeDOM.
// Fix: clicking on folders/toggles no longer closes the menu.
import { els } from './dom.js';
import { fetchNodesIndex, groupNodesByCategory } from './nodes-index.js';
import { buildNodeDOM } from './render.js';

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
  }
  #ctx .preview-item:focus-visible{ outline:2px solid #60a5fa; }
  #ctx .preview-item:hover{ background:#0b142a; }
  #ctx .preview-item .hint{
    margin-top:4px;
    font:500 11px/1.1 system-ui,Segoe UI,Roboto,Arial,sans-serif;
    color:#93a1b5;
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
  `;
  document.head.appendChild(s);
})();

/* ---------- public API ---------- */
export async function openContextMenu(screenX, screenY, onChoose){
  const idx = await fetchNodesIndex();
  const tree = groupNodesByCategory(idx.nodes || []);

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

  // build collapsible tree (collapsed by default)
  buildTreeCollapsible(els.ctxMenu, tree, onChoose);

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
