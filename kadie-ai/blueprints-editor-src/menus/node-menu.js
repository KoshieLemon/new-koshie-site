// node-menu.js — palette menu that INHERITS folder structure from /nodes/.
// No pre-defined collapsing. No per-node folders. Nodes without folders appear at root.

import { els } from '../core/dom.js';
import { requestOpen, notifyClosed } from './menu-manager.js';

/* ---------- load nodes index ---------- */
async function loadNodesIndexOnce() {
  const paths = [
    '../providers/nodes-index.js',
    '../nodes-index.js',
    '/kadie-ai/blueprints-editor-src/providers/nodes-index.js',
    '/kadie-ai/blueprints-editor-src/nodes-index.js',
  ];
  for (const p of paths) {
    try {
      const m = await import(/* @vite-ignore */ p);
      const fn = m?.fetchNodesIndex;
      if (typeof fn === 'function') {
        const idx = await fn();
        const list = Array.isArray(idx?.nodes) ? idx.nodes
                   : Array.isArray(idx)        ? idx
                   : Array.isArray(idx?.list)  ? idx.list : [];
        return list;
      }
    } catch {}
  }
  console.error('[node-menu] nodes-index provider not found');
  return [];
}

/* ---------- tiny utils ---------- */
const norm = (s)=>String(s||'').trim();
const lc   = (s)=>norm(s).toLowerCase();
const splitCatString = (s) =>
  norm(s).replace(/[\\]+/g,'/').replace(/[.]+/g,'/').replace(/\/+/g,'/')
         .split('/').map(x=>x.trim()).filter(Boolean);

// Derive folder parts strictly from file path under “…/nodes/…/<file>”
function getPartsFromSourcePath(def){
  const any = norm(def?.path || def?.file || def?.src || '');
  if (!any) return null;
  const low = any.toLowerCase();
  const i = low.lastIndexOf('/nodes/');
  if (i < 0) return null;
  // strip up to /nodes/, then drop final filename
  const tail = any.slice(i + 7);
  const parts = tail.split('/').slice(0, -1).map(norm).filter(Boolean);
  return parts.length ? parts : [];
}

// Category extraction policy:
// 1) If categoryPath is provided, use it as-is.
// 2) Else if category string exists, use full split (no collapsing).
// 3) Else use folder parts from source path under /nodes/.
// 4) Else [], meaning top-level item with no folder.
function extractCategoryPath(def){
  if (Array.isArray(def?.categoryPath) && def.categoryPath.length) {
    return def.categoryPath.map(norm).filter(Boolean);
  }
  const rawCat = norm(def?.category);
  if (rawCat) {
    return splitCatString(rawCat);
  }
  const fromSrc = getPartsFromSourcePath(def);
  if (fromSrc && fromSrc.length) return fromSrc;
  return []; // top-level
}

/* ---------- tree build ---------- */
function buildTreeFromNodes(nodes){
  const root = { __folders:new Map(), __items:[] };
  for (const def of nodes){
    const parts = extractCategoryPath(def); // array of folder names
    let cur = root;
    for (const label of parts){
      const key = lc(label);
      let next = cur.__folders.get(key);
      if (!next){
        next = { __key:key, __label:label, __folders:new Map(), __items:[] };
        cur.__folders.set(key, next);
      }
      cur = next;
    }
    cur.__items.push(def); // item goes only in its final folder, not in every level
  }
  return root;
}

/* ---------- fuzzy search (simple) ---------- */
const textOf = (d)=>`${d.name||''} ${d.id||''} ${d.category||''}`.toLowerCase();
function rank(nodes,q,limit=200){
  q = lc(q);
  if (!q) return [];
  const scored = [];
  for (const d of nodes){
    const t = textOf(d);
    const inc = t.includes(q) ? 1 : 0;
    if (!inc) continue;
    scored.push({ d, s: 1 });
  }
  return scored.slice(0,limit).map(x=>x.d);
}

/* ---------- styles ---------- */
(function injectStyles(){
  if (document.getElementById('ctx-menu-styles')) return;
  const s = document.createElement('style');
  s.id = 'ctx-menu-styles';
  s.textContent = `
  :root{ --ctx-w:340px; --ctx-h:420px; --ctx-font:12.5px; --ctx-pad:6px; }
  #ctx{ position:fixed; z-index:2147483000; display:none; width:var(--ctx-w); height:var(--ctx-h);
        background:#0a0f19; color:#e5e7eb; border:1px solid #1f2937; border-radius:8px;
        box-shadow:0 14px 36px rgba(0,0,0,.6); overflow:auto; padding:var(--ctx-pad); }
  #ctx *{ box-sizing:border-box; font:500 var(--ctx-font)/1.15 system-ui,Segoe UI,Roboto,Arial,sans-serif; }
  #ctx .search{ position:sticky; top:0; background:#0a0f19; z-index:5; padding:0 0 var(--ctx-pad) 0; border-bottom:1px solid #0f172a; margin-bottom:var(--ctx-pad); }
  #ctx .search .wrap{ display:flex; align-items:center; gap:6px; background:#0b1222; border:1px solid #182235; border-radius:6px; padding:4px 8px; }
  #ctx .search input{ flex:1; background:transparent; border:none; outline:none; color:#e5e7eb; min-height:24px; }
  #ctx details{ border:none; border-bottom:1px solid #0f172a; margin:0; }
  #ctx details:last-child{ border-bottom:none; }
  #ctx summary{ cursor:pointer; user-select:none; list-style:none; display:flex; align-items:center; gap:8px; padding:6px; color:#cbd5e1; font-weight:600; }
  #ctx summary::-webkit-details-marker{ display:none; }
  #ctx .chev{ width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid #94a3b8; transition:transform .12s ease; }
  #ctx details[open] .chev{ transform:rotate(90deg); }
  #ctx .folder-body{ padding:2px 0 4px 10px; }
  #ctx .item{ display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:6px; cursor:pointer; }
  #ctx .item:hover{ background:#0c1730; }
  #ctx .results{ display:none; }
  `;
  document.head.appendChild(s);
})();

/* ---------- DOM helpers ---------- */
const truncate = (s,n=28)=>String(s||'').length>n ? String(s).slice(0,n-3)+'…' : String(s||'');
function setActive(list, idx){ list.forEach((el,i)=>el.classList.toggle('active', i===idx)); }
function pinWithinViewport(ctx, x, y){
  const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const mw = ctx.offsetWidth || 340, mh = ctx.offsetHeight || 420, pad = 8;
  let left = x, top = y;
  if (x + mw > vw - pad) left = Math.max(pad, x - mw);
  if (left < pad) left = pad;
  if (y + mh > vh - pad) top = Math.max(pad, y - mh);
  if (top < pad) top = pad;
  ctx.style.left = left + 'px';
  ctx.style.top  = top  + 'px';
}
function appendInChunks(items, makeEl, container, batch=120){
  let i=0, cancelled=false;
  function step(){
    if(cancelled) return;
    const end=Math.min(i+batch, items.length);
    const frag=document.createDocumentFragment();
    for(; i<end; i++) frag.appendChild(makeEl(items[i]));
    container.appendChild(frag);
    if(i<items.length) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return ()=>{ cancelled=true; };
}

/* ---------- cached state ---------- */
const state = { built:false, all:[], tree:null, ctx:null, input:null, resultsEl:null, treeWrap:null, onChoose:null, cancelTopItems:null };
let currentCtx = null;

/* ---------- hide ---------- */
function hideOnce(ctx){
  if(ctx?.style) ctx.style.display='none';
  currentCtx=null;
  notifyClosed('palette');
}
export function hideContextMenu(){ hideOnce(currentCtx); }
;(function bindGlobalHide(){
  if (!els?.editor) return;
  const hide = (ev)=>{
    if (!currentCtx) return;
    if (ev.type==='mousedown' && ev.button!==0) return;
    hideOnce(currentCtx);
  };
  els.editor.addEventListener('dragstart', hide);
  els.editor.addEventListener('mousedown', hide);
})();

/* ---------- builders ---------- */
function buildItemRow(def){
  const row=document.createElement('div');
  row.className='item'; row.tabIndex=0;
  row.setAttribute('draggable','true'); row.setAttribute('data-id',def.id);
  row.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/x-node-id', def.id); });
  row.addEventListener('click', ()=>{
    if (typeof state.onChoose === 'function') state.onChoose(def.id);
    hideOnce(state.ctx);
  });
  const name=document.createElement('span'); name.textContent=def.name || def.id || 'node';
  row.appendChild(name);
  return row;
}
function buildLazyFolders(rootEl, node){
  const folders = [...node.__folders.values()].sort((a,b)=> a.__label.localeCompare(b.__label));
  for (const f of folders){
    const details=document.createElement('details');
    const summary=document.createElement('summary');
    const chev=document.createElement('span'); chev.className='chev';
    const label=document.createElement('span');
    label.textContent = truncate(String(f.__label||''), 28);
    label.title = String(f.__label||'');
    summary.appendChild(chev); summary.appendChild(label);
    details.appendChild(summary);
    const body=document.createElement('div'); body.className='folder-body';
    details.appendChild(body);

    let loaded=false, cancel=null;
    details.addEventListener('toggle', ()=>{
      if(details.open && !loaded){
        buildLazyFolders(body, f);
        const items = (f.__items||[]).slice().sort((a,b)=> (a.name||a.id).localeCompare(b.name||b.id));
        if (items.length){ cancel = appendInChunks(items, d => buildItemRow(d), body, 160); }
        loaded=true;
      } else if(!details.open){
        if (cancel) cancel();
        body.innerHTML=''; loaded=false;
      }
    });

    rootEl.appendChild(details);
  }
}

/* ---------- search UI ---------- */
function buildSearchableUI(root){
  const search=document.createElement('div'); search.className='search';
  const wrap=document.createElement('div'); wrap.className='wrap';
  const input=document.createElement('input'); input.type='text'; input.placeholder='Search nodes…'; input.autocapitalize='off'; input.autocomplete='off'; input.spellcheck=false; input.setAttribute('aria-label','Search nodes');
  wrap.appendChild(input); search.appendChild(wrap);

  const results=document.createElement('div'); results.className='results';
  const treeWrap=document.createElement('div'); treeWrap.className='tree';
  root.appendChild(search); root.appendChild(results); root.appendChild(treeWrap);
  return { input, resultsEl:results, treeWrap };
}

/* ---------- init ---------- */
async function initOnce(){
  if (state.built) return;

  const allRaw = await loadNodesIndexOnce();
  // Do not hide by special roots. Do not invent categories. Just use source/category.
  state.all = Array.isArray(allRaw) ? allRaw.slice() : [];

  state.tree = buildTreeFromNodes(state.all);

  state.ctx = els?.ctxMenu || document.getElementById('ctx') || (() => {
    const d=document.createElement('div'); d.id='ctx'; document.body.appendChild(d); return d;
  })();
  if (state.ctx.parentElement !== document.body) document.body.appendChild(state.ctx);

  state.ctx.innerHTML='';
  const ui = buildSearchableUI(state.ctx);
  state.input = ui.input; state.resultsEl = ui.resultsEl; state.treeWrap = ui.treeWrap;

  buildLazyFolders(state.treeWrap, state.tree);

  // Items with no folders appear at top-level.
  if (state.tree.__items?.length){
    const items = state.tree.__items.slice().sort((a,b)=> (a.name||a.id).localeCompare(b.name||b.id));
    state.cancelTopItems = appendInChunks(items, d => buildItemRow(d), state.treeWrap, 160);
  }

  // Open first folder by default
  queueMicrotask(()=>{ const first = state.treeWrap.querySelector('details'); if (first && !first.open) first.open = true; });

  clampMenuToViewport();

  // basic search
  let t=null, activeIdx=-1;
  const doFilter = (val)=>{
    const q=val.trim();
    state.resultsEl.innerHTML='';
    if(!q){ state.resultsEl.style.display='none'; state.treeWrap.style.display=''; activeIdx=-1; return; }
    const matches=rank(state.all,q,600);
    state.resultsEl.style.display='block'; state.treeWrap.style.display='none';
    const items=[];
    appendInChunks(matches, def=>{ const el=buildItemRow(def); items.push(el); return el; }, state.resultsEl, 160);
    activeIdx=items.length?0:-1;
  };
  state.input.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>doFilter(state.input.value),70); });
  state.input.addEventListener('keydown', (e)=>{
    const items=[...state.resultsEl.querySelectorAll('.item')];
    if(e.key==='ArrowDown'&&items.length){ e.preventDefault(); activeIdx=Math.min(items.length-1,activeIdx+1); setActive(items,activeIdx); }
    else if(e.key==='ArrowUp'&&items.length){ e.preventDefault(); activeIdx=Math.max(0,activeIdx-1); setActive(items,activeIdx); }
    else if(e.key==='Enter'&&items.length){ e.preventDefault(); const ch=items[activeIdx]||items[0]; const id=ch?.getAttribute('data-id'); if(id){ if (typeof state.onChoose==='function') state.onChoose(id); hideOnce(state.ctx); } }
  });

  state.built = true;
}

/* ---------- open ---------- */
export async function openContextMenu(clientX, clientY, onChoose){
  await initOnce();
  state.onChoose = onChoose || null;

  requestOpen('palette', hideContextMenu);

  const ctx = state.ctx;
  currentCtx = ctx;
  if (ctx.parentElement !== document.body) document.body.appendChild(ctx);

  state.input.value = '';
  state.resultsEl.style.display='none';
  state.treeWrap.style.display='';

  ctx.style.display='block';
  clampMenuToViewport();
  pinWithinViewport(ctx, clientX, clientY);
  state.input.focus();
  state.input.select();

  const outside=(ev)=>{ if(!ev.composedPath().includes(ctx)) hideOnce(ctx); };
  window.addEventListener('pointerdown', outside, { once:true });
  window.addEventListener('keydown', e=>{ if(e.key==='Escape') hideOnce(ctx); }, { once:true });
}

/* ---------- sizing ---------- */
function clampMenuToViewport(){
  const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const w = Math.min(vw-16, Math.max(300, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ctx-w')) || 340));
  const maxH = Math.floor(vh*0.70);
  const h = Math.min(maxH, Math.max(300, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ctx-h')) || 420));
  document.documentElement.style.setProperty('--ctx-w', `${w}px`);
  document.documentElement.style.setProperty('--ctx-h', `${h}px`);
}

export function setContextMenuSize(widthPx=340, heightPx=420, fontPx=12.5){
  document.documentElement.style.setProperty('--ctx-w', `${Math.max(300, widthPx|0)}px`);
  document.documentElement.style.setProperty('--ctx-h', `${Math.max(300, heightPx|0)}px`);
  document.documentElement.style.setProperty('--ctx-font', `${Math.max(11.5, fontPx)}px`);
  clampMenuToViewport();
}

/* ---------- idle warm ---------- */
(function prime(){
  const cb = ()=>{ initOnce().catch((e)=>console.error('[node-menu] init error', e)); };
  if ('requestIdleCallback' in window) window.requestIdleCallback(cb, { timeout:1500 });
  else setTimeout(cb, 300);
})();
