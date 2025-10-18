// /kadie-ai/blueprints-editor-src/actions-menu.js
// Minimal actions menu: Duplicate / Delete. One-at-a-time managed by menu-manager.

import { requestOpen, notifyClosed } from './menu-manager.js';

(function injectActionsMenuStyles(){
  if (document.getElementById('ctx-actions-styles')) return;
  const s = document.createElement('style');
  s.id = 'ctx-actions-styles';
  s.textContent = `
    #ctx-actions{
      position:fixed; z-index:2147483646; display:none;
      background:#0a0f19; color:#e5e7eb;
      border:1px solid #1f2937; border-radius:8px;
      box-shadow:0 12px 28px rgba(0,0,0,.55);
      padding:4px; width:max-content; height:auto;
      min-width:168px; max-width:260px; overflow:hidden;
      -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
    }
    #ctx-actions *{ box-sizing:border-box; font:600 12.5px/1.15 system-ui,Segoe UI,Roboto,Arial,sans-serif; }
    #ctx-actions .item{ display:flex; align-items:center; gap:8px; padding:6px 10px; cursor:pointer; border-radius:6px; user-select:none; white-space:nowrap; }
    #ctx-actions .item:hover{ background:#0c1730; }
    #ctx-actions .item.danger{ color:#f87171; }
    #ctx-actions .item.danger:hover{ background:#2b0f16; }
    #ctx-actions .sep{ height:1px; margin:4px 0; background:#0f172a; }
  `;
  document.head.appendChild(s);
})();

const state = {
  built:false,
  root:null,
  items:[],
  onDuplicate:null,
  onDelete:null,
};

function ensureBuilt(){
  if (state.built) return;
  const root = document.createElement('div');
  root.id = 'ctx-actions';
  document.body.appendChild(root);

  const mkItem = (label, className='')=>{
    const el = document.createElement('div');
    el.className = `item${className ? ' ' + className : ''}`;
    el.textContent = label;
    el.tabIndex = 0;
    return el;
  };

  const btnDuplicate = mkItem('Duplicate');
  const sep = document.createElement('div'); sep.className = 'sep';
  const btnDelete = mkItem('Delete','danger');

  root.appendChild(btnDuplicate);
  root.appendChild(sep);
  root.appendChild(btnDelete);

  btnDuplicate.addEventListener('click', ()=>{ hideActionsMenu(); state.onDuplicate && state.onDuplicate(); });
  btnDelete.addEventListener('click', ()=>{ hideActionsMenu(); state.onDelete && state.onDelete(); });

  const items=[btnDuplicate, btnDelete];
  let idx=0;
  const setActive=i=>{ idx=i; items.forEach((el,k)=>el.classList.toggle('active',k===idx)); items[idx].focus(); };
  root.addEventListener('keydown',(e)=>{
    if (e.key==='Escape'){ hideActionsMenu(); return; }
    if (e.key==='ArrowDown'){ e.preventDefault(); setActive(Math.min(items.length-1, idx+1)); }
    if (e.key==='ArrowUp'){ e.preventDefault(); setActive(Math.max(0, idx-1)); }
    if (e.key==='Enter'){ e.preventDefault(); items[idx].click(); }
  });

  state.root=root; state.items=items; state.built=true;
}

function pinToViewport(x, y){
  const r = state.root;
  r.style.left='0px'; r.style.top='0px'; r.style.display='block';
  const mw=r.offsetWidth, mh=r.offsetHeight;
  const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  const pad=8;
  let left=x, top=y;
  if (x+mw>vw-pad) left=Math.max(pad, x-mw);
  if (left<pad) left=pad;
  if (y+mh>vh-pad) top=Math.max(pad, y-mh);
  if (top<pad) top=pad;
  r.style.left=left+'px'; r.style.top=top+'px';
}

let outsideHandler=null;
export function hideActionsMenu(){
  if (!state.built) return;
  state.root.style.display='none';
  if (outsideHandler){
    window.removeEventListener('pointerdown', outsideHandler, true);
    window.removeEventListener('wheel', outsideHandler, true);
    window.removeEventListener('keydown', outsideHandler, true);
    outsideHandler=null;
  }
  notifyClosed('actions');
}

export function openActionsMenu(clientX, clientY, handlers){
  ensureBuilt();
  state.onDuplicate = handlers?.onDuplicate || null;
  state.onDelete    = handlers?.onDelete    || null;

  // ensure exclusivity
  requestOpen('actions', hideActionsMenu);

  state.root.style.display='block';
  pinToViewport(clientX, clientY);
  state.items[0].focus();

  outsideHandler = (ev)=>{
    if (ev.type==='keydown' && ev.key==='Escape'){ hideActionsMenu(); return; }
    if (!state.root.contains(ev.target)) hideActionsMenu();
  };
  window.addEventListener('pointerdown', outsideHandler, true);
  window.addEventListener('wheel', outsideHandler, true);
  window.addEventListener('keydown', outsideHandler, true);
}

export function bindActionsMenu(el, handlers){
  if (!el) return;
  el.addEventListener('contextmenu', (e)=>{
    e.preventDefault();
    openActionsMenu(e.clientX, e.clientY, handlers);
  });
}
