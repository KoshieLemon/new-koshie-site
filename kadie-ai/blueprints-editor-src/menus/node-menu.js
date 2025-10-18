// Node palette menu. Build once. Compact UE-style. One-at-a-time via menu-manager.

import { els } from '../core/dom.js';
import { requestOpen, notifyClosed } from './menu-manager.js';

/* ---------- dynamic provider loader ---------- */
async function loadNodesIndexOnce() {
  // Try common locations and tolerate different return shapes.
  const tryPaths = [
    '../providers/nodes-index.js',
    '../nodes-index.js',
    '/kadie-ai/blueprints-editor-src/providers/nodes-index.js',
    '/kadie-ai/blueprints-editor-src/nodes-index.js',
  ];
  for (const p of tryPaths) {
    try {
      const m = await import(/* @vite-ignore */ p);
      if (m && typeof m.fetchNodesIndex === 'function') {
        const idx = await m.fetchNodesIndex();
        const nodes =
          Array.isArray(idx?.nodes) ? idx.nodes :
          Array.isArray(idx)        ? idx :
          Array.isArray(idx?.list)  ? idx.list : [];
        console.debug('[node-menu] nodes loaded:', nodes.length, 'via', p);
        return nodes;
      }
    } catch (e) {
      console.warn('[node-menu] load attempt failed for', p, e?.message || e);
    }
  }
  console.error('[node-menu] No nodes-index provider resolved.');
  return [];
}

/* ---------- styles (once) ---------- */
(function injectCtxMenuStyles(){
  if (document.getElementById('ctx-menu-styles')) return;
  const s = document.createElement('style');
  s.id = 'ctx-menu-styles';
  s.textContent = `
  :root{
    --ctx-w: 340px;
    --ctx-h: 420px;
    --ctx-font: 12.5px;
    --ctx-pad: 6px;
    --ctx-row-vpad: 4px;
    --ctx-indent: 10px;
  }
  #ctx{
    position:fixed; z-index:2147483647; display:none;
    width:var(--ctx-w); height:var(--ctx-h);
    background:#0a0f19; color:#e5e7eb;
    border:1px solid #1f2937; border-radius:8px;
    box-shadow:0 14px 36px rgba(0,0,0,.6);
    overflow:auto; padding:var(--ctx-pad);
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  }
  #ctx *{ box-sizing:border-box; font:500 var(--ctx-font)/1.15 system-ui,Segoe UI,Roboto,Arial,sans-serif; }
  #ctx .search{ position:sticky; top:0; background:#0a0f19; z-index:5; padding:0 0 var(--ctx-pad) 0; border-bottom:1px solid #0f172a; margin-bottom:var(--ctx-pad); }
  #ctx .search .wrap{ display:flex; align-items:center; gap:6px; background:#0b1222; border:1px solid #182235; border-radius:6px; padding:4px 8px; }
  #ctx .search input{ flex:1; background:transparent; border:none; outline:none; color:#e5e7eb; min-height:24px; }
  #ctx details{ border:none; border-bottom:1px solid #0f172a; margin:0; }
  #ctx details:last-child{ border-bottom:none; }
  #ctx summary{ cursor:pointer; user-select:none; list-style:none; display:flex; align-items:center; gap:8px; padding:${'calc(var(--ctx-row-vpad) + 2px)'} 6px; color:#cbd5e1; font-weight:600; }
  #ctx summary::-webkit-details-marker{ display:none; }
  #ctx summary .chev{ width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid #94a3b8; transition:transform .12s ease; }
  #ctx details[open] summary .chev{ transform:rotate(90deg); }
  #ctx .folder-body{ padding:${'calc(var(--ctx-row-vpad))'} 0 ${'calc(var(--ctx-row-vpad))'} var(--ctx-indent); }
  #ctx .item{ display:flex; align-items:center; gap:8px; padding:${'calc(var(--ctx-row-vpad))'} 8px; border-radius:6px; cursor:pointer; }
  #ctx .item:hover{ background:#0c1730; }
  #ctx .item.active{ background:#12274e; }
  #ctx .results{ display:none; }
  #ctx .hint, #ctx .aux, #ctx .clear, #ctx .footer, #ctx .help { display:none !important; }
  `;
  document.head.appendChild(s);
})();

/* ---------- fuzzy search ---------- */
const norm = s => String(s||'').toLowerCase().trim();
const subseq = (a,b)=>{ let i=0,j=0,m=0; while(i<a.length&&j<b.length){ if(a[i]===b[j]){m++;j++;} i++; } return b.length?m/b.length:1; };
function lev(a,b){
  a=norm(a); b=norm(b);
  const n=a.length,m=b.length; if(!n) return m; if(!m) return n;
  const d=new Array(m+1); for(let j=0;j<=m;j++) d[j]=j;
  for(let i=1;i<=n;i++){ let p=d[0],t; d[0]=i;
    for(let j=1;j<=m;j++){ t=d[j]; d[j]=(a[i-1]===b[j-1])?p:1+Math.min(p,d[j-1],d[j]); p=t; } }
  return d[m];
}
function score(def,q){
  const name=norm(def.name), id=norm(def.id), cat=norm(def.category||'');
  const key=`${name} ${id} ${cat}`;
  const inc=key.includes(q)?1:0, pref=name.startsWith(q)?1:0;
  const s1=1-lev(name,q)/Math.max(name.length,q.length,1);
  const s2=subseq(name,q);
  return Math.max(0,0.65*s1+0.30*s2+0.05*inc+0.05*pref);
}
function rank(nodes,q,limit=200){
  q=norm(q); if(!q) return [];
  return nodes.map(def=>({def,s:score(def,q)}))
    .sort((a,b)=>b.s-a.s||a.def.name.localeCompare(b.def.name))
    .filter(x=>x.s>=0.35).slice(0,limit).map(x=>x.def);
}

/* ---------- category helpers ---------- */
const ROOTS_SPECIAL = new Set(['events','flow']);
function splitCatString(s){ return s.replace(/[.\\]/g,'/').replace(/\/+/g,'/').split('/').map(x=>x.trim()).filter(Boolean); }
function getPartsFromSourcePath(def){
  const anyPath=String(def?.path||def?.file||def?.src||'').trim(); if(!anyPath) return null;
  const idx=anyPath.toLowerCase().lastIndexOf('/nodes/'); if(idx<0) return null;
  const trail=anyPath.slice(idx+7); const parts=trail.split('/').slice(0,-1).map(x=>x.trim()).filter(Boolean);
  return parts.length?parts:null;
}
function partsFromIdForRoot(def, root){
  const id=String(def?.id||'').trim(); if(!id) return null;
  const segs=splitCatString(id); if(!segs.length) return null;
  const head=segs[0].toLowerCase(); let tail=(head===root)?segs.slice(1):segs;
  if(tail.length>1) tail=tail.slice(0,-1);
  return tail.length?[root, ...tail]:[root];
}
function extractCategoryPath(def){
  if (Array.isArray(def?.categoryPath) && def.categoryPath.length) return def.categoryPath.map(x=>String(x).trim()).filter(Boolean);
  const rawCat=String(def?.category||'').trim();
  if(rawCat){
    const parts=splitCatString(rawCat);
    if(parts.length>1) return parts;
    if(parts.length===1 && ROOTS_SPECIAL.has(parts[0].toLowerCase())){
      const deep=partsFromIdForRoot(def, parts[0].toLowerCase()); if(deep) return deep; return parts;
    }
  }
  const fromSrc=getPartsFromSourcePath(def);
  if(fromSrc && fromSrc.length){ const r0=fromSrc[0]?.toLowerCase(); if(ROOTS_SPECIAL.has(r0)) return [r0, ...fromSrc.slice(1)]; return fromSrc; }
  const guess=(()=>{ const id=String(def?.id||'').toLowerCase(); for(const r of ROOTS_SPECIAL){ if(id.startsWith(r+'.')||id.startsWith(r+'/')) return r; }
                     const cat=String(def?.category||'').toLowerCase(); for(const r of ROOTS_SPECIAL){ if(cat===r) return r; } return null; })();
  if(guess){ const deep=partsFromIdForRoot(def,guess); if(deep) return deep; }
  return ['uncategorized'];
}

/* ---------- tree build ---------- */
function buildTreeFromNodes(nodes){
  const root={ __folders:new Map(), __items:[] };
  for(const def of nodes){
    const parts=extractCategoryPath(def);
    let cur=root;
    for(const raw of parts){
      const key=String(raw).toLowerCase();
      let next=cur.__folders.get(key);
      if(!next){ next={ __key:key, __label:raw, __folders:new Map(), __items:[] }; cur.__folders.set(key,next); }
      cur=next;
    }
    cur.__items.push(def);
  }
  return root;
}

/* ---------- DOM utils ---------- */
const truncate = (s, n=25)=> String(s||'').length>n ? String(s).slice(0, n-3)+'...' : String(s||'');
function setActive(list, idx){ list.forEach((el,i)=>el.classList.toggle('active', i===idx)); }
function pinWithinViewport(ctx, x, y){
  const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const mw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ctx-w')) || ctx.offsetWidth || 340;
  const mh = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ctx-h')) || 420;
  const pad = 8;
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
const state = {
  built: false,
  all: [],
  tree: null,
  ctx: null,
  input: null,
  resultsEl: null,
  treeWrap: null,
  onChoose: null,
  cancelTopItems: null,
};
let currentCtx = null;

/* ---------- hide ---------- */
function hideOnce(ctx){
  if(ctx?.style) ctx.style.display='none';
  currentCtx=null;
  notifyClosed('palette');
}
export function hideContextMenu(){ hideOnce(currentCtx); }

/* hide on canvas mousedown or native dragstart */
;(function registerHideOnDrag(){
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
    const fullLabel = String(f.__label || '');
    label.textContent = truncate(fullLabel, 25);
    label.title = fullLabel;
    summary.appendChild(chev); summary.appendChild(label);
    details.appendChild(summary);

    const body=document.createElement('div'); body.className='folder-body';
    details.appendChild(body);

    let loaded=false, cancel=null;
    details.addEventListener('toggle', ()=>{
      if(details.open && !loaded){
        buildLazyFolders(body, f);
        const items = (f.__items||[]).slice().sort((a,b)=> (a.name||a.id).localeCompare(b.name||b.id));
        if (items.length){
          cancel = appendInChunks(items, d => buildItemRow(d), body, 160);
        }
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

/* ---------- init once ---------- */
async function initOnce(){
  if (state.built) return;

  const allRaw = await loadNodesIndexOnce();
  // NEW: hide nodes flagged as hidden
  state.all = (allRaw || []).filter(d => !d?.hidden);

  state.tree = buildTreeFromNodes(state.all);

  state.ctx = els?.ctxMenu || document.getElementById('ctx') || (() => {
    const d=document.createElement('div'); d.id='ctx'; document.body.appendChild(d); return d;
  })();
  if (state.ctx.parentElement !== document.body) document.body.appendChild(state.ctx);

  state.ctx.innerHTML='';
  const { input, resultsEl, treeWrap } = buildSearchableUI(state.ctx);
  state.input = input; state.resultsEl = resultsEl; state.treeWrap = treeWrap;

  buildLazyFolders(state.treeWrap, state.tree);

  if (state.tree.__items?.length){
    const items = state.tree.__items.slice().sort((a,b)=> (a.name||a.id).localeCompare(b.name||b.id));
    state.cancelTopItems = appendInChunks(items, d => buildItemRow(d), state.treeWrap, 160);
  }

  // Auto-open first folder to reveal items immediately.
  queueMicrotask(()=>{
    const first = state.treeWrap.querySelector('details');
    if (first && !first.open) first.open = true;
  });

  clampMenuToViewport();

  let activeIdx=-1;
  const doFilter = (val)=>{
    const q=val.trim();
    state.resultsEl.innerHTML='';
    if(!q){ state.resultsEl.style.display='none'; state.treeWrap.style.display=''; activeIdx=-1; return; }
    const matches=rank(state.all,q,600);
    state.resultsEl.style.display='block'; state.treeWrap.style.display='none';
    const items=[];
    appendInChunks(matches, def=>{
      const el=buildItemRow(def);
      items.push(el); return el;
    }, state.resultsEl, 160);
    activeIdx=items.length?0:-1;
  };
  let t=null;
  state.input.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>doFilter(state.input.value),70); });
  state.input.addEventListener('keydown', (e)=>{
    const items=[...state.resultsEl.querySelectorAll('.item')];
    if(e.key==='ArrowDown'&&items.length){ e.preventDefault(); activeIdx=Math.min(items.length-1,activeIdx+1); setActive(items,activeIdx); }
    else if(e.key==='ArrowUp'&&items.length){ e.preventDefault(); activeIdx=Math.max(0,activeIdx-1); setActive(items,activeIdx); }
    else if(e.key==='Enter'&&items.length){ e.preventDefault(); const ch=items[activeIdx]||items[0]; const id=ch?.getAttribute('data-id'); if(id){ if (typeof state.onChoose==='function') state.onChoose(id); hideOnce(state.ctx); } }
  });

  state.built = true;
}

/* ---------- public: open ---------- */
export async function openContextMenu(clientX, clientY, onChoose){
  await initOnce();
  state.onChoose = onChoose || null;

  // ensure exclusivity
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

/* ---------- sizing controls ---------- */
function clampMenuToViewport(){
  const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const w = Math.min(vw-16, Math.max(300, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ctx-w')) || 340));
  const maxH = Math.floor(vh*0.70);
  const h = Math.min(maxH, Math.max(300, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ctx-h')) || 420));
  document.documentElement.style.setProperty('--ctx-w', `${w}px`);
  document.documentElement.style.setProperty('--ctx-h', `${h}px`);
}

/* Optional runtime tweak */
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
