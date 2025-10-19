// variable-action-menu.js
// Self-contained UI for the Set/Get Variable pop-up.
// Managed by menu-manager; no global state beyond attach helpers.

import { requestOpen, notifyClosed } from './menu-manager.js';

// Public API
export function openVariableActionMenu(x, y, payload){
  const id = 'var-action-menu';

  // Remove any existing instance of this specific menu
  const old = document.getElementById(id);
  if (old) old.remove();

  // Build UI
  const root = document.createElement('div');
  root.id = id;
  Object.assign(root.style, {
    position:'fixed', left:`${x}px`, top:`${y}px`, zIndex: 2147483647,
    background:'#0a0f19', color:'#e5e7eb',
    border:'1px solid #1f2937', borderRadius:'10px',
    boxShadow:'0 14px 36px rgba(0,0,0,.6)', padding:'6px', minWidth:'170px',
    fontFamily:'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
  });

  const title = document.createElement('div');
  title.textContent = payload?.name || 'variable';
  Object.assign(title.style, {
    fontWeight:'700', fontSize:'12px', opacity:.9, padding:'4px 6px', borderBottom:'1px solid #111827', marginBottom:'6px'
  });

  function mkBtn(text, disabled){
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      width:'100%', textAlign:'left', padding:'8px 10px', margin:'4px 0',
      border:'1px solid #2b2f3a', borderRadius:'8px',
      background: disabled ? '#12151c' : '#0f1117',
      color: disabled ? '#6b7280' : '#e5e7eb',
      cursor: disabled ? 'not-allowed' : 'pointer', fontSize:'13px'
    });
    if (!disabled){
      b.onmouseenter = ()=> b.style.background = '#0c1730';
      b.onmouseleave = ()=> b.style.background = '#0f1117';
    }
    return b;
  }

  const isLocked = !!payload?.readonly;
  const btnSet = mkBtn('Set Variable', isLocked);
  const btnGet = mkBtn('Get Variable', false);

  function spawn(nodeId, params){
    if (window.Blueprint && typeof window.Blueprint.addNode === 'function'){
      window.Blueprint.addNode(nodeId, { ...params, _spawnAt:{ x, y } });
    } else {
      window.dispatchEvent(new CustomEvent('blueprint:addNode', {
        detail: { node: nodeId, params: params || {}, at: { x, y } }
      }));
    }
  }

  btnSet.onclick = ()=>{
    if (isLocked) return;
    spawn('variables.set', {
      name: payload?.name || '',
      value: null,
      readonly: false
    });
    closeSelf();
  };

  btnGet.onclick = ()=>{
    spawn('get.variable', {
      name: payload?.name || '',
      type: payload?.type || 'string',
      readonly: !!payload?.readonly,
      id: payload?.id ?? null,
      kind: payload?.kind || payload?.type || null,
      source: payload?.readonly ? 'server' : 'user'
    });
    closeSelf();
  };

  root.append(title, btnSet, btnGet);
  document.body.appendChild(root);

  // Constrain to viewport after layout
  requestAnimationFrame(()=>{
    const r = root.getBoundingClientRect();
    let nx = x, ny = y;
    if (r.right > innerWidth - 8) nx = Math.max(8, innerWidth - 8 - r.width);
    if (r.bottom > innerHeight - 8) ny = Math.max(8, innerHeight - 8 - r.height);
    root.style.left = `${nx}px`; root.style.top = `${ny}px`;
  });

  function outside(ev){ if (!root.contains(ev.target)) closeSelf(); }
  function esc(ev){ if (ev.key === 'Escape') closeSelf(); }
  function closeSelf(){
    root.remove();
    notifyClosed(id);
    document.removeEventListener('mousedown', outside);
    document.removeEventListener('keydown', esc);
  }

  document.addEventListener('mousedown', outside);
  document.addEventListener('keydown', esc);

  // Register with manager so other menus auto-close
  requestOpen(id, closeSelf);
}

// Optional global for legacy callers
if (typeof window !== 'undefined'){
  window.__openVariableActionMenu = openVariableActionMenu;
}

export default { openVariableActionMenu };
