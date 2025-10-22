// Editor renderer that uses the universal node builder.
import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { buildNodeDOM } from './render.node.js';
import { fitSvg, drawWires } from './render.wires.js';
import { addNodeAt } from '../interactions/interactions.nodes.js';
import { uid } from '../core/state.js';

// ensure selection set exists
if (!(state.sel instanceof Set)) state.sel = new Set();

let nodeInteractionHook = null;
export function registerNodeInteractions(fn){ nodeInteractionHook = fn; }

function defFor(defId){
  const list = (state.nodesIndex?.nodes || window.NODE_INDEX || []);
  const found = list.find(d => d.id === defId);
  if (found) return found;
  const alt = (window.NODE_DEFS && window.NODE_DEFS[defId]) || null;
  if (!alt) {
    console.warn('[render] node def not found:', defId, {
      have: list.map(d=>d.id),
      haveGlobal: window.NODE_DEFS ? Object.keys(window.NODE_DEFS) : []
    });
  }
  return alt;
}

function hasIncomingEdge(nid, pin){
  for (const e of state.edges.values()){
    if (e.to?.nid === nid && e.to?.pin === pin) return true;
  }
  return false;
}

// ---- visibility engine: hide pins based on def.runtime.shape.hideWhen rules
function applyParamVisibility(def, params, nid){
  const shape = def?.runtime?.shape;
  const rules = Array.isArray(shape?.hideWhen) ? shape.hideWhen : null;
  if (!rules || rules.length === 0) return def;

  const hiddenIn  = new Set();
  const hiddenOut = new Set();

  for (const r of rules){
    const whenPin = r?.when?.pin;
    const equals  = r?.when?.equals;
    if (!whenPin || typeof r?.hide === 'undefined') continue;
    const val = params ? params[whenPin] : undefined;
    if (val === equals){
      for (const tgt of r.hide){
        const [side, name] = String(tgt).split('.');
        if (side === 'inputs')  hiddenIn.add(name);
        else if (side === 'outputs') hiddenOut.add(name);
      }
    }
  }

  if (hiddenIn.size === 0 && hiddenOut.size === 0) return def;

  const newIns  = (def.inputs  || []).filter(p => !hiddenIn.has(p.name));
  const newOuts = (def.outputs || []).filter(p => !hiddenOut.has(p.name));

  // drop wires to hidden INPUT pins
  for (const [eid,e] of [...state.edges]){
    if (e.to?.nid === nid && hiddenIn.has(e.to.pin)) state.edges.delete(eid);
  }
  // scrub saved params for hidden inputs
  const n = state.nodes.get(nid);
  if (n && n.params){
    for (const k of hiddenIn) delete n.params[k];
  }

  return {
    ...def,
    inputs: newIns,
    outputs: newOuts,
    pins:   { in: newIns, out: newOuts },
    params: newIns,
    returns: newOuts,
    hasExecIn:  newIns.some(p => p.type === 'exec'),
    hasExecOut: newOuts.some(p => p.type === 'exec'),
  };
}

export function renderNode(n){
  const base = defFor(n.defId);
  const source = n._defOverride ? n._defOverride : base;
  const def  = applyParamVisibility(source, (n.params||{}), n.id);

  const el = buildNodeDOM(def, { preview:false, params: (n.params||{}), nid: n.id });

  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  els.nodesLayer.appendChild(el);

  if (nodeInteractionHook) nodeInteractionHook(el, n);

  for (const pin of el.querySelectorAll('.pin.left.data')){
    const name = pin.dataset.pin;
    const wired = hasIncomingEdge(n.id, name);
    const lit = pin.querySelector('.literal-wrap');
    if (lit) lit.style.display = wired ? 'none' : '';
  }

  const isSelected = state.sel instanceof Set && state.sel.has(n.id);
  el.classList.toggle('selected', isSelected);
}

export function renderAll(){
  els.nodesLayer.innerHTML = '';
  for (const n of state.nodes.values()){
    if (!n.params) n.params = {};
    renderNode(n);
  }
  fitSvg();
  drawWires();
}

/* =======================
   Variable-chip drop → Set/Get menu
   ======================= */

function isVariableDrag(ev){
  const types = Array.from(ev.dataTransfer?.types || []);
  return types.includes('application/x-variable');
}
function parseVarPayload(ev){
  try { return JSON.parse(ev.dataTransfer.getData('application/x-variable')); }
  catch { return null; }
}
function findSetNodeDefId(){
  const list = (state.nodesIndex?.nodes || window.NODE_INDEX || []);
  const byId = (id)=> list.find(d=> d.id === id);
  return (
    byId('flow.setVariable')?.id ||         // prefer basename match → setVariable.js
    byId('flow.set')?.id ||                 // legacy id, if you keep it elsewhere
    byId('actions.variables.set')?.id ||
    byId('variables.set')?.id ||
    (list.find(d=> /set\s*variable/i.test(String(d?.name||'')))?.id) ||
    (list.find(d=> /setvariable/i.test(String(d?.id||'')))?.id) ||
    null
  );
}

// Convert screen point to node-layer space (accounts for pan/zoom matrix)
function worldPoint(ev){
  const layer = els.nodesLayer;
  const r = layer.getBoundingClientRect();
  const sx = ev.clientX - r.left;
  const sy = ev.clientY - r.top;

  const tr = getComputedStyle(layer).transform; // matrix(a,b,c,d,e,f) or none
  if (!tr || tr === 'none') return { x: Math.round(sx), y: Math.round(sy) };

  const m = tr.match(/matrix\(([-0-9., e]+)\)/);
  if (!m) return { x: Math.round(sx), y: Math.round(sy) };
  const [a,b,c,d,e,f] = m[1].split(',').map(Number);
  const det = a*d - b*c || 1;
  const ix =  ( d*(sx - e) - c*(sy - f)) / det;
  const iy = (-b*(sx - e) + a*(sy - f)) / det;
  return { x: Math.round(ix), y: Math.round(iy) };
}

function pinUnder(ev){
  const path = ev.composedPath ? ev.composedPath() : [];
  const pinEl = path.find(n => n && n.classList && n.classList.contains('pin'));
  if (!pinEl) return null;
  const nodeEl = pinEl.closest('.node');
  if (!nodeEl) return null;
  return {
    side: pinEl.classList.contains('left') ? 'left' : 'right',
    kind: pinEl.dataset.kind,
    pin:  pinEl.dataset.pin,
    nid:  nodeEl.dataset.nid
  };
}
function ensureEdgesMap(){
  if (!(state.edges instanceof Map)) state.edges = new Map();
  return state.edges;
}
function autowireFromGet(getNodeId, target){
  if (!target || target.side !== 'left' || target.kind !== 'data') return;
  const edges = ensureEdgesMap();
  const id = uid('E');
  edges.set(id, {
    from: { nid: getNodeId, pin: 'value' },
    to:   { nid: target.nid, pin: target.pin },
    kind: 'data'
  });
  drawWires();
}

function showSetGetMenu(ev, payload){
  const pt = worldPoint(ev);
  const target = pinUnder(ev);

  const menu = document.createElement('div');
  menu.style.position = 'fixed';
  menu.style.left = `${ev.clientX}px`;
  menu.style.top  = `${ev.clientY}px`;
  Object.assign(menu.style, {
    zIndex: 2147483647,
    background: '#0b1020',
    color: '#e5e7eb',
    border: '1px solid #1f2937',
    borderRadius: '10px',
    boxShadow: '0 14px 36px rgba(0,0,0,.6)',
    padding: '6px',
    minWidth: '160px'
  });

  function mkBtn(label){
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, {
      display:'block', width:'100%', textAlign:'left',
      background:'#111827', color:'#e5e7eb',
      border:'1px solid #374151', borderRadius:'8px',
      padding:'6px 8px', margin:'4px 0', cursor:'pointer'
    });
    b.onmouseenter = ()=> b.style.background = '#1f2937';
    b.onmouseleave = ()=> b.style.background = '#111827';
    b.onmousedown  = (e)=> e.stopPropagation();
    return b;
  }

  const btnGet = mkBtn('Get variable');
  const btnSet = mkBtn('Set variable');

  btnGet.onclick = ()=>{
    document.body.removeChild(menu);
    const defId = 'flow.variable';
    const node = addNodeAt(defId, pt.x, pt.y, {
      name: payload?.name || '',
      type: payload?.type || '',
      readonly: !!payload?.readonly,
      id: payload?.id || null,
      kind: payload?.kind || payload?.type || null,
      source: payload?.source || (payload?.readonly ? 'server' : 'user')
    });
    autowireFromGet(node.id, target);
  };

  btnSet.onclick = ()=>{
    document.body.removeChild(menu);
    const defId = findSetNodeDefId();
    if (!defId){
      console.warn('[render] no Set Variable node found');
      return;
    }
    addNodeAt(defId, pt.x, pt.y, {
      name: payload?.name || '',
      type: payload?.type || '',
      readonly: !!payload?.readonly,
      source: 'user'
    });
  };

  menu.append(btnGet, btnSet);
  document.body.appendChild(menu);

  const close = (e)=>{
    if (!menu.contains(e.target)) {
      try{ document.body.removeChild(menu); }catch{}
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('keydown', onKey, true);
    }
  };
  const onKey = (e)=>{ if (e.key === 'Escape') close(e); };
  window.addEventListener('mousedown', close, true);
  window.addEventListener('keydown', onKey, true);
}

// Intercept variable drags only
if (typeof window !== 'undefined'){
  els.editor.addEventListener('dragover', (ev)=>{
    if (isVariableDrag(ev)){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }
  }, true);

  els.editor.addEventListener('drop', (ev)=>{
    if (!isVariableDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const payload = parseVarPayload(ev);
    showSetGetMenu(ev, payload);
  }, true);
}
