// bot-options-src/menu.js
// Node palette with fuzzy search, true folder submenus, and chunked lazy rendering.
// Submenus reflect /nodes/** subfolders. For "events" and "flow", subfolders
// are derived from the node id when source path metadata is absent.

import { els } from './dom.js';
import { fetchNodesIndex } from './nodes-index.js';
import { buildNodeDOM } from './render.node.js';

/* ---------- styles (compact, fixed on top) ---------- */
(function injectCtxMenuStyles(){
  if (document.getElementById('ctx-menu-styles')) return;
  const s = document.createElement('style');
  s.id = 'ctx-menu-styles';
  s.textContent = `
  #ctx{
    position:fixed; z-index:2147483647; display:none;
    width:300px; max-height:70vh; overflow:auto;
    background:#0b1020; color:#e5e7eb;
    border:1px solid #1f2937; border-radius:8px;
    box-shadow:0 12px 36px rgba(0,0,0,.55);
    padding:4px 4px 6px;
  }
  #ctx *{ box-sizing:border-box; }

  /* search */
  #ctx .search{ position:sticky; top:0; background:#0b1020; z-index:5; padding-bottom:4px; margin-bottom:4px; border-bottom:1px solid #111827; }
  #ctx .search .wrap{ display:flex; gap:6px; align-items:center; background:#0a0f1a; border:1px solid #1f2937; border-radius:6px; padding:4px 6px; }
  #ctx .search input{ flex:1; background:transparent; border:none; outline:none; color:#e5e7eb; font:500 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif; }
  #ctx .search .btn{ background:#111827; border:1px solid #1f2937; color:#cbd5e1; font:600 11px/1 system-ui,Segoe UI,Roboto,Arial,sans-serif; padding:2px 8px; border-radius:6px; cursor:pointer; }
  #ctx .search .hint{ margin-top:3px; color:#93a1b5; font:500 10px/1.1 system-ui,Segoe UI,Roboto,Arial,sans-serif; }

  /* folders */
  #ctx details{ border:none; border-bottom:1px solid #111827; margin:0; background:transparent; }
  #ctx details:last-child{ border-bottom:none; }
  #ctx summary{ cursor:pointer; user-select:none; list-style:none; display:flex; align-items:center; gap:6px; padding:6px; font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif; color:#cbd5e1; }
  #ctx summary::-webkit-details-marker{ display:none; }
  #ctx summary .chev{ width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid #9ca3af; transition:transform .12s ease; }
  #ctx details[open] summary .chev{ transform:rotate(90deg); }
  #ctx .folder-body{ padding:2px 0 4px 10px; }

  /* rows */
  #ctx .preview-item{ padding:2px 4px; cursor:pointer; border-radius:6px; }
  #ctx .preview-item:hover{ background:#0b142a; }
  #ctx .preview-item.active{ outline:2px solid #3b82f6aa; }
  #ctx .preview-frame{ width:292px; height:68px; position:relative; overflow:hidden; }
  #ctx .preview-frame .node{ position:absolute; inset:0 auto auto 0; transform:scale(.64); transform-origin:top left; pointer-events:none; }

  /* search results */
  #ctx .results{ display:none; }
  `;
  document.head.appendChild(s);
})();

/* ---------- fuzzy match ---------- */
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

/* ---------- folder path extraction ---------- */
/* Priority:
   1) def.categoryPath: string[]
   2) def.category: supports '.', '/', '\'
   3) explicit source path: def.path|def.file|def.src after '/nodes/'
   4) special-case for 'events' and 'flow': derive from def.id segments
   5) fallback ['uncategorized']
*/
const ROOTS_SPECIAL = new Set(['events','flow']);
function splitCatString(s){
  return s.replace(/[.\\]/g,'/').replace(/\/+/g,'/').split('/').map(x=>x.trim()).filter(Boolean);
}
function getPartsFromSourcePath(def){
  const anyPath = String(def?.path || def?.file || def?.src || '').trim();
  if (!anyPath) return null;
  const idx = anyPath.toLowerCase().lastIndexOf('/nodes/');
  if (idx < 0) return null;
  const trail = anyPath.slice(idx + 7); // after "/nodes/"
  const parts = trail.split('/').slice(0, -1).map(x=>x.trim()).filter(Boolean); // drop filename
  return parts.length ? parts : null;
}
function partsFromIdForRoot(def, root){
  const id = String(def?.id || '').trim();
  if (!id) return null;
  const segs = splitCatString(id);
  if (!segs.length) return null;
  // If id already starts with the root, use tail segments
  const head = segs[0].toLowerCase();
  let tail = (head === root) ? segs.slice(1) : segs;
  // treat last as file name; use preceding as folders
  if (tail.length > 1) tail = tail.slice(0, -1);
  return tail.length ? [root, ...tail] : [root];
}
function extractCategoryPath(def){
  // 1) explicit array
  if (Array.isArray(def?.categoryPath) && def.categoryPath.length){
    return def.categoryPath.map(x=>String(x).trim()).filter(Boolean);
  }
  // 2) category string
  const rawCat = String(def?.category||'').trim();
  if (rawCat){
    const parts = splitCatString(rawCat);
    if (parts.length > 1) return parts;
    if (parts.length === 1 && ROOTS_SPECIAL.has(parts[0].toLowerCase())){
      // try to deepen using id if only the root is present
      const deep = partsFromIdForRoot(def, parts[0].toLowerCase());
      if (deep) return deep;
      return parts;
    }
  }
  // 3) source path
  const fromSrc = getPartsFromSourcePath(def);
  if (fromSrc && fromSrc.length){
    // normalize case if the first segment is a special root
    const r0 = fromSrc[0]?.toLowerCase();
    if (ROOTS_SPECIAL.has(r0)) return [r0, ...fromSrc.slice(1)];
    return fromSrc;
  }
  // 4) id-derived for special roots if we can detect them in id
  const idGuessRoot = (() => {
    const id = String(def?.id || '').toLowerCase();
    for (const r of ROOTS_SPECIAL){ if (id.startsWith(r + '.') || id.startsWith(r + '/')) return r; }
    const cat = String(def?.category || '').toLowerCase();
    for (const r of ROOTS_SPECIAL){ if (cat === r) return r; }
    return null;
  })();
  if (idGuessRoot){
    const deep = partsFromIdForRoot(def, idGuessRoot);
    if (deep) return deep;
  }
  // 5) fallback
  return ['uncategorized'];
}

/* Build tree with case-insensitive keys so 'Events' and 'events' merge. */
function buildTreeFromNodes(nodes){
  const root = { __folders: new Map(), __items: [] };
  for (const def of nodes){
    const parts = extractCategoryPath(def);
    let cur = root;
    for (const raw of parts){
      const key = String(raw).toLowerCase();
      let next = cur.__folders.get(key);
      if (!next){
        next = { __key: key, __label: raw, __folders: new Map(), __items: [] };
        cur.__folders.set(key, next);
      }
      cur = next;
    }
    cur.__items.push(def);
  }
  return root;
}

/* ---------- chunked append ---------- */
function appendInChunks(items, makeEl, container, batch=30){
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

/* ---------- menu API ---------- */
export async function openContextMenu(clientX, clientY, onChoose){
  const idx = await fetchNodesIndex();
  const all = idx.nodes || [];
  const tree = buildTreeFromNodes(all);

  if (els.ctxMenu.parentElement !== document.body) document.body.appendChild(els.ctxMenu);

  const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  Object.assign(els.ctxMenu.style, {
    left: clientX + 'px',
    top:  clientY + 'px',
    display: 'block',
    maxHeight: Math.floor(vh*0.8)+'px'
  });
  els.ctxMenu.innerHTML='';

  const { input, clearBtn, resultsEl, treeWrap } = buildSearchableUI(els.ctxMenu);

  // top-level folders only; children render on expand
  buildLazyFolders(treeWrap, tree, onChoose);

  // root-level items once
  if (tree.__items?.length){
    const items = tree.__items.slice().sort((a,b)=> a.name.localeCompare(b.name));
    appendInChunks(items, d => buildPreviewItem(d,onChoose), treeWrap, 30);
  }

  requestAnimationFrame(()=>{
    const mw = els.ctxMenu.offsetWidth||0, mh=els.ctxMenu.offsetHeight||0;
    let lx=clientX, ly=clientY;
    if(lx+mw>vw) lx=Math.max(0, vw-mw-8);
    if(ly+mh>vh) ly=Math.max(0, vh-mh-8);
    els.ctxMenu.style.left=`${lx}px`; els.ctxMenu.style.top=`${ly}px`;
    input.focus(); input.select();
  });

  // search across all nodes; results render in chunks
  let activeIdx=-1;
  const doFilter = (val)=>{
    const q=val.trim();
    resultsEl.innerHTML='';
    if(!q){ resultsEl.style.display='none'; treeWrap.style.display=''; activeIdx=-1; return; }
    const matches=rank(all,q,500);
    resultsEl.style.display='block'; treeWrap.style.display='none';
    const items=[];
    appendInChunks(matches, def=>{
      const el=buildPreviewItem(def,onChoose);
      items.push(el); return el;
    }, resultsEl, 40);
    activeIdx=items.length?0:-1;
  };

  let t=null;
  input.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>doFilter(input.value),70); });
  clearBtn.addEventListener('click', ()=>{ input.value=''; doFilter(''); input.focus(); });

  input.addEventListener('keydown', (e)=>{
    const items=[...resultsEl.querySelectorAll('.preview-item')];
    if(e.key==='ArrowDown'&&items.length){ e.preventDefault(); activeIdx=Math.min(items.length-1,activeIdx+1); setActive(items,activeIdx); }
    else if(e.key==='ArrowUp'&&items.length){ e.preventDefault(); activeIdx=Math.max(0,activeIdx-1); setActive(items,activeIdx); }
    else if(e.key==='Enter'&&items.length){ e.preventDefault(); const ch=items[activeIdx]||items[0]; const id=ch?.getAttribute('data-id'); if(id){ onChoose(id); hideOnce(); } }
  });

  const outside=(ev)=>{ if(!ev.composedPath().includes(els.ctxMenu)) hideOnce(); };
  window.addEventListener('pointerdown', outside, { once:true });
  window.addEventListener('keydown', e=>{ if(e.key==='Escape') hideOnce(); }, { once:true });
}

/* ---------- lazy folders: create submenus only; items render on expand ---------- */
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
        // submenus
        buildLazyFolders(body, f, onChoose);
        // this folder's items
        const items = (f.__items||[]).slice().sort((a,b)=> a.name.localeCompare(b.name));
        if (items.length){
          cancel = appendInChunks(items, d => buildPreviewItem(d,onChoose), body, 30);
        }
        loaded=true;
      } else if(!details.open){
        if (cancel) cancel();
        body.innerHTML='';
        loaded=false;
      }
    });

    rootEl.appendChild(details);
  }
}

/* ---------- preview item ---------- */
function buildPreviewItem(def, onChoose){
  const outer=document.createElement('div');
  outer.className='preview-item'; outer.tabIndex=0;
  outer.setAttribute('draggable','true'); outer.setAttribute('data-id',def.id);
  outer.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/x-node-id', def.id); });
  outer.addEventListener('click', ()=>{ onChoose(def.id); hideOnce(); });

  const frame=document.createElement('div'); frame.className='preview-frame';
  const nodeEl=buildNodeDOM(def,{ preview:true, nid:null, params:{} });
  frame.appendChild(nodeEl); outer.appendChild(frame);
  return outer;
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
function hideOnce(){ const el=document.getElementById('ctx'); if(el?.style) el.style.display='none'; }
