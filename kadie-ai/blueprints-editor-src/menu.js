// /kadie-ai/menu.js
// Compact node palette with fixed-size scroll, lazy folders, and viewport-clamped positioning.

import { els } from './dom.js';
import { fetchNodesIndex } from './nodes-index.js';

/* ---------- styles: compact + fixed-size ---------- */
(function injectCtxMenuStyles(){
  if (document.getElementById('ctx-menu-styles')) return;
  const s = document.createElement('style');
  s.id = 'ctx-menu-styles';
  s.textContent = `
  :root{ --ctx-w:300px; --ctx-h: clamp(360px, 70vh, 560px); }

  #ctx{
    position:fixed; z-index:2147483647; display:none;
    width:var(--ctx-w); height:var(--ctx-h); overflow:auto;
    background:#0b1020; color:#e5e7eb;
    border:1px solid #1f2937; border-radius:8px;
    box-shadow:0 12px 36px rgba(0,0,0,.55);
    padding:6px;
  }
  #ctx *{ box-sizing:border-box; }

  /* search */
  #ctx .search{ position:sticky; top:0; background:#0b1020; z-index:5; padding-bottom:6px; margin-bottom:6px; border-bottom:1px solid #111827; }
  #ctx .search .wrap{ display:flex; gap:6px; align-items:center; background:#0a0f1a; border:1px solid #1f2937; border-radius:6px; padding:4px 6px; }
  #ctx .search input{ flex:1; background:transparent; border:none; outline:none; color:#e5e7eb; font:500 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif; }
  #ctx .search .btn{ background:#111827; border:1px solid #1f2937; color:#cbd5e1; font:600 11px/1 system-ui,Segoe UI,Roboto,Arial,sans-serif; padding:2px 8px; border-radius:6px; cursor:pointer; }
  #ctx .search .hint{ margin-top:4px; color:#93a1b5; font:500 10px/1.1 system-ui,Segoe UI,Roboto,Arial,sans-serif; }

  /* folder tree (very thin rows) */
  #ctx details{ border:none; border-bottom:1px solid #111827; margin:0; background:transparent; }
  #ctx details:last-child{ border-bottom:none; }
  #ctx summary{ cursor:pointer; user-select:none; list-style:none; display:flex; align-items:center; gap:6px; padding:4px 4px; font:600 12px/1 system-ui,Segoe UI,Roboto,Arial,sans-serif; color:#cbd5e1; }
  #ctx summary::-webkit-details-marker{ display:none; }
  #ctx summary .chev{ width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid #9ca3af; transition:transform .12s ease; }
  #ctx details[open] summary .chev{ transform:rotate(90deg); }
  #ctx .folder-body{ padding:2px 0 4px 10px; }

  /* item rows: compact text-only */
  #ctx .item{ display:flex; align-items:center; gap:6px; padding:3px 6px; border-radius:6px; font:500 12px/1.15 system-ui,Segoe UI,Roboto,Arial,sans-serif; color:#e5e7eb; cursor:pointer; }
  #ctx .item:hover{ background:#0b142a; }
  #ctx .item .id{ color:#93a1b5; font-size:10px; margin-left:auto; }

  /* results vs tree */
  #ctx .results{ display:none; }
  `;
  document.head.appendChild(s);
})();

/* ---------- fuzzy match (compact search) ---------- */
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

/* ---------- category path extraction (unchanged logic) ---------- */
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

/* ---------- chunked append ---------- */
function appendInChunks(items, makeEl, container, batch=80){
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

/* ---------- API ---------- */
export async function openContextMenu(clientX, clientY, onChoose){
  const idx = await fetchNodesIndex();
  const all = idx.nodes || [];
  const tree = buildTreeFromNodes(all);

  // Obtain or create the context menu host
  const ctx = els?.ctxMenu || document.getElementById('ctx') || (() => {
    const d=document.createElement('div'); d.id='ctx'; document.body.appendChild(d); return d;
  })();

  if (ctx.parentElement !== document.body) document.body.appendChild(ctx);

  // fixed size per CSS vars
  resizeFixed(ctx);

  // render shell
  ctx.innerHTML='';
  ctx.style.display='block';
  const { input, clearBtn, resultsEl, treeWrap } = buildSearchableUI(ctx);

  // top-level folders only; children render on expand
  buildLazyFolders(treeWrap, tree, onChoose);

  // root-level items (rare) once
  if (tree.__items?.length){
    const items = tree.__items.slice().sort((a,b)=> a.name.localeCompare(b.name));
    appendInChunks(items, d => buildItemRow(d,onChoose), treeWrap, 80);
  }

  // clamp to viewport with pivot logic
  pinWithinViewport(ctx, clientX, clientY);

  // search
  let activeIdx=-1;
  const doFilter = (val)=>{
    const q=val.trim();
    resultsEl.innerHTML='';
    if(!q){ resultsEl.style.display='none'; treeWrap.style.display=''; activeIdx=-1; return; }
    const matches=rank(all,q,600);
    resultsEl.style.display='block'; treeWrap.style.display='none';
    const items=[];
    appendInChunks(matches, def=>{
      const el=buildItemRow(def,onChoose);
      items.push(el); return el;
    }, resultsEl, 100);
    activeIdx=items.length?0:-1;
  };

  let t=null;
  input.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>doFilter(input.value),70); });
  clearBtn.addEventListener('click', ()=>{ input.value=''; doFilter(''); input.focus(); });

  input.addEventListener('keydown', (e)=>{
    const items=[...resultsEl.querySelectorAll('.item')];
    if(e.key==='ArrowDown'&&items.length){ e.preventDefault(); activeIdx=Math.min(items.length-1,activeIdx+1); setActive(items,activeIdx); }
    else if(e.key==='ArrowUp'&&items.length){ e.preventDefault(); activeIdx=Math.max(0,activeIdx-1); setActive(items,activeIdx); }
    else if(e.key==='Enter'&&items.length){ e.preventDefault(); const ch=items[activeIdx]||items[0]; const id=ch?.getAttribute('data-id'); if(id){ onChoose(id); hideOnce(ctx); } }
  });

  const outside=(ev)=>{ if(!ev.composedPath().includes(ctx)) hideOnce(ctx); };
  window.addEventListener('pointerdown', outside, { once:true });
  window.addEventListener('keydown', e=>{ if(e.key==='Escape') hideOnce(ctx); }, { once:true });

  // keep pinned on resize
  const onResize = ()=>{ resizeFixed(ctx); pinWithinViewport(ctx, clientX, clientY); };
  window.addEventListener('resize', onResize, { once:true });
}

/* ---------- lazy folders, compact body ---------- */
function buildLazyFolders(rootEl, node, onChoose){
  const folders = [...node.__folders.values()].sort((a,b)=> a.__label.localeCompare(b.__label));
  for (const f of folders){
    const details=document.createElement('details');
    const summary=document.createElement('summary');
    const chev=document.createElement('span'); chev.className='chev';
    const label=document.createElement('span'); label.textContent=f.__label;
    summary.appendChild(chev); summary.appendChild(label);
    details.appendChild(summary);

    const body=document.createElement('div'); body.className='folder-body';
    details.appendChild(body);

    let loaded=false, cancel=null;
    details.addEventListener('toggle', ()=>{
      if(details.open && !loaded){
        buildLazyFolders(body, f, onChoose);
        const items = (f.__items||[]).slice().sort((a,b)=> a.name.localeCompare(b.name));
        if (items.length){
          cancel = appendInChunks(items, d => buildItemRow(d,onChoose), body, 100);
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

/* ---------- item row (compact) ---------- */
function buildItemRow(def, onChoose){
  const row=document.createElement('div');
  row.className='item'; row.tabIndex=0;
  row.setAttribute('draggable','true'); row.setAttribute('data-id',def.id);
  row.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/x-node-id', def.id); });
  row.addEventListener('click', ()=>{ onChoose(def.id); hideOnce(document.getElementById('ctx')); });

  const name=document.createElement('span'); name.textContent=def.name || def.id || 'node';
  const idEl=document.createElement('span'); idEl.className='id'; idEl.textContent=def.id || '';
  row.appendChild(name); row.appendChild(idEl);
  return row;
}

/* ---------- search UI ---------- */
function buildSearchableUI(root){
  const search=document.createElement('div'); search.className='search';
  const wrap=document.createElement('div'); wrap.className='wrap';
  const input=document.createElement('input'); input.type='text'; input.placeholder='Search nodes…'; input.autocapitalize='off'; input.autocomplete='off'; input.spellcheck=false; input.setAttribute('aria-label','Search nodes');
  const clearBtn=document.createElement('button'); clearBtn.className='btn'; clearBtn.type='button'; clearBtn.textContent='Clear';
  wrap.appendChild(input); wrap.appendChild(clearBtn); search.appendChild(wrap);
  const hint=document.createElement('div'); hint.className='hint'; hint.textContent='Arrow keys + Enter. Typo-tolerant.';
  search.appendChild(hint);

  const results=document.createElement('div'); results.className='results';
  const treeWrap=document.createElement('div'); treeWrap.className='tree';
  root.appendChild(search); root.appendChild(results); root.appendChild(treeWrap);
  return { input, clearBtn, resultsEl:results, treeWrap };
}

/* ---------- helpers ---------- */
function setActive(list, idx){ list.forEach((el,i)=>el.classList.toggle('active', i===idx)); }
function hideOnce(ctx){ if(ctx?.style) ctx.style.display='none'; }

function resizeFixed(ctx){
  // keep a fixed menu size across expansions; recompute once per open/resize
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const h = Math.max(360, Math.min(Math.floor(vh*0.70), 560));
  ctx.style.height = h + 'px';
}

function pinWithinViewport(ctx, x, y){
  const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const mw = ctx.offsetWidth || parseInt(getComputedStyle(ctx).width,10) || 300;
  const mh = ctx.offsetHeight || parseInt(getComputedStyle(ctx).height,10) || 400;
  const pad = 8;

  // default pivot: bottom-right of cursor
  let left = x, top = y;

  // horizontal pivot
  if (x + mw > vw - pad) left = Math.max(pad, x - mw); // pivot to left of cursor
  if (left < pad) left = pad;

  // vertical pivot
  if (y + mh > vh - pad) top = Math.max(pad, y - mh);  // pivot above cursor
  if (top < pad) top = pad;

  ctx.style.left = left + 'px';
  ctx.style.top  = top  + 'px';
}
