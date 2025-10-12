// Main interactions and wiring.
import { els } from './dom.js';
import { state, uid, pushHistory, markDirty, undo, redo } from './state.js';
import { renderAll, drawWires, bezierPath, getPinCenter, registerNodeInteractions } from './render.js';
import { openContextMenu } from './menu.js';
import { TYPE_COLORS, colorKeyFor, DISCORD_SHAPES, toFinalPrimitive } from './render.types.js';
import { ensureViewport, applyView, unprojectClient, positionCtxMenuAt, recenter } from './interactions.view.js';

// ---- guards
if (!state.nodes) state.nodes = new Map();
if (!state.edges) state.edges = new Map();
if (!state.sel)   state.sel   = new Set();
if (!state.view)  state.view  = { x: 0, y: 0, z: 1 };

const NODE_W = 200;
const NODE_H = 92;

let drag = null;
let dragWire = null;
let panning = null; // left-drag panning on empty space

function cancelDragWire(redraw){
  if (dragWire?.tempPath){ dragWire.tempPath.remove(); dragWire.tempPath = null; }
  dragWire = null;
  if (redraw) drawWires();
}

// ---- helpers
function getDef(defId){
  const list = (state.nodesIndex?.nodes || window.NODE_INDEX || []);
  const found = list.find(d => d.id === defId);
  if (found) return found;
  return (window.NODE_DEFS && window.NODE_DEFS[defId]) || null;
}
function getOutputType(defId, pinName){
  const def = getDef(defId);
  const pin = def?.outputs?.find?.(p => p.name === pinName);
  return pin?.type || null;
}

// ---- Break Object dynamic output expansion ----
function shapeForType(t){
  const key = colorKeyFor(t);
  return DISCORD_SHAPES[key] || [];
}
function applyBreakObjectShape(nid, sourceType){
  const n = state.nodes.get(nid);
  if (!n) return;

  const baseIn  = [
    { name:'in', type:'exec' },
    { name:'object', type: sourceType || 'any' },
  ];
  const raw = shapeForType(sourceType);
  const finalDataPins = raw.map(f => ({ name: f.name, type: toFinalPrimitive(f.type) }));
  const outPins = [{ name:'out', type:'exec' }, ...finalDataPins];

  n._defOverride = {
    id: n.defId,
    name: 'Break Object',
    category: 'Utilities',
    kind: 'exec',
    version: '1.0.0',
    inputs: baseIn,
    outputs: outPins,
    hasExecIn: true,
    hasExecOut: true,
    pins: { in: baseIn, out: outPins },
    params: baseIn,
    returns: outPins,
  };

  renderAll();
}

function enableNodeInteractions(el, model){
  // drag node
  el.addEventListener('mousedown', (ev)=>{
    if (ev.button!==0) return;
    if (!ev.shiftKey && !state.sel.has(model.id)) {
      state.sel.clear();
      state.sel.add(model.id);
      renderAll();
    }
    const start = { x: ev.clientX, y: ev.clientY };
    const startPos = [...state.sel].map(id => {
      const n = state.nodes.get(id);
      return { id, x: n.x, y: n.y };
    });
    drag = { start, startPos };
    ev.preventDefault();
  });

  // node context menu (Duplicate/Delete) only
  el.addEventListener('contextmenu', (ev)=>{
    ev.preventDefault();
    ev.stopPropagation(); // prevents canvas palette
    els.ctxMenu.innerHTML = '';
    positionCtxMenuAt(ev.clientX, ev.clientY);
    const mk = (label,fn)=>{
      const d=document.createElement('div');
      d.className='menu-item';
      d.textContent=label;
      d.addEventListener('click',()=>{ fn(); els.ctxMenu.style.display='none';});
      return d;
    };
    els.ctxMenu.appendChild(mk('Duplicate', ()=>{
      const n = structuredClone(state.nodes.get(model.id));
      n.id = uid('N'); n.x += 24; n.y += 24;
      state.nodes.set(n.id, n);
      state.sel.clear(); state.sel.add(n.id);
      renderAll(); pushHistory(); markDirty(els.dirty);
    }));
    els.ctxMenu.appendChild(mk('Delete', ()=>{
      state.nodes.delete(model.id);
      for (const [id,e] of [...state.edges]) {
        if (e.from.nid===model.id || e.to.nid===model.id) state.edges.delete(id);
      }
      renderAll(); pushHistory(); markDirty(els.dirty);
    }));
    window.addEventListener('click',()=>{ els.ctxMenu.style.display='none'; }, { once:true });
  });

  // start wire drag only from OUTPUT pins on the right
  el.querySelectorAll('.pin .jack').forEach(j=>{
    j.addEventListener('mousedown', (ev)=>{
      ev.stopPropagation();
      const pinEl = ev.currentTarget.closest('.pin');
      const isRight = pinEl.classList.contains('right');
      if (!isRight) return; // enforce output→input direction

      const kind = pinEl.classList.contains('exec') ? 'exec' : 'data';
      const fromType = pinEl.dataset.type || (kind==='exec' ? 'exec' : 'string');
      const colorKey = kind === 'data' ? colorKeyFor(fromType) : null;

      dragWire = {
        from:{ nid:model.id, pin: pinEl.dataset.pin },
        side:'right',
        kind, fromType, colorKey,
        tempPath:null
      };
      ev.preventDefault();
    });
  });
}

function addNodeAt(defId, x, y){
  const n = { id: uid('N'), defId, x: Math.round(x), y: Math.round(y) };
  state.nodes.set(n.id, n);
  state.sel.clear(); state.sel.add(n.id);
  renderAll(); pushHistory(); markDirty(els.dirty);
}

export function initInteractions(){
  ensureViewport();
  registerNodeInteractions(enableNodeInteractions);

  // Zoom
  els.editor.addEventListener('wheel', (ev)=>{
    ev.preventDefault();
    const { z } = state.view;
    const er = els.editor.getBoundingClientRect();
    const sx = ev.clientX - er.left, sy = ev.clientY - er.top;
    const wx = (sx - state.view.x) / z;
    const wy = (sy - state.view.y) / z;
    const factor = Math.exp(-ev.deltaY * 0.0015);
    const nz = Math.min(3, Math.max(0.25, z * factor));
    state.view.x = sx - wx * nz;
    state.view.y = sy - wy * nz;
    state.view.z = nz;
    applyView();
  }, { passive:false });

  // Left-drag panning on blank space
  els.editor.addEventListener('mousedown', (ev)=>{
    if (ev.button === 0){
      const hitNode = ev.target.closest?.('.node');
      const hitPin  = ev.target.closest?.('.pin, .jack, .label, .literal-wrap, .pin-input');
      if (!hitNode && !hitPin){
        panning = { startX: ev.clientX, startY: ev.clientY, vx: state.view.x, vy: state.view.y };
        ev.preventDefault();
      }
    }
  });

  els.editor.addEventListener('mousemove',(ev)=>{
    if (drag){
      const dz = 1 / (state.view.z || 1);
      const dx = (ev.clientX - drag.start.x) * dz;
      const dy = (ev.clientY - drag.start.y) * dz;
      for (const s of drag.startPos){
        const n = state.nodes.get(s.id);
        n.x = Math.round(s.x + dx);
        n.y = Math.round(s.y + dy);
      }
      renderAll(); markDirty(els.dirty);
    } else if (dragWire){
      const from = getPinCenter(dragWire.from.nid, dragWire.from.pin, 'right');
      const er = els.editor.getBoundingClientRect();
      const to = { x: ev.clientX - er.left, y: ev.clientY - er.top };
      if (dragWire.tempPath) dragWire.tempPath.remove();
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('class', `wire`);
      p.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));
      const stroke = dragWire.kind==='data'
        ? (TYPE_COLORS[dragWire.colorKey] || '#94a3b8')
        : '#ffffff';
      p.style.setProperty('--wire', stroke);
      els.wiresSvg.appendChild(p);
      dragWire.tempPath = p;
    } else if (panning){
      state.view.x = panning.vx + (ev.clientX - panning.startX);
      state.view.y = panning.vy + (ev.clientY - panning.startY);
      applyView();
    }
  });

  window.addEventListener('mouseup',()=>{
    if (drag){ drag=null; pushHistory(); }
    if (dragWire){ cancelDragWire(true); }
    if (panning){ panning=null; }
  });

  // Editor context menu (palette) on blank space
  els.editor.addEventListener('contextmenu', async (ev)=>{
    const inNode = ev.target.closest?.('.node');
    const inPin  = ev.target.closest?.('.pin, .jack, .label, .literal-wrap, .pin-input');
    if (inNode || inPin) return;
    ev.preventDefault();
    await openContextMenu(ev.clientX, ev.clientY, (defId)=>{
      const w = unprojectClient(ev.clientX, ev.clientY);
      addNodeAt(defId, w.x - NODE_W/2, w.y - NODE_H/2);
    });
  });

  // DnD from menu
  els.editor.addEventListener('dragover', (e)=>{ e.preventDefault(); });
  els.editor.addEventListener('drop', (e)=>{
    e.preventDefault();
    const defId = e.dataTransfer.getData('text/x-node-id');
    if (!defId) return;
    const w = unprojectClient(e.clientX, e.clientY);
    addNodeAt(defId, w.x - NODE_W/2, w.y - NODE_H/2);
  });

  // Finish wire connection with checks + Break expansion
  els.editor.addEventListener('mouseup',(ev)=>{
    if (!dragWire) return;

    const pinEl = ev.target.closest?.('.pin.left, .pin.right');
    const toNodeEl = ev.target.closest?.('.node');
    if (!pinEl || !toNodeEl){ cancelDragWire(true); return; }

    const toSide = pinEl.classList.contains('right') ? 'right' : 'left';
    if (toSide === 'right'){ cancelDragWire(true); return; }

    const toNid  = toNodeEl.dataset.nid;
    const toPin  = pinEl.dataset.pin;
    const toKind = pinEl.classList.contains('exec') ? 'exec' : 'data';
    const toType = pinEl.dataset.type || (toKind==='exec' ? 'exec' : 'string');

    if (dragWire.from.nid === toNid){ cancelDragWire(true); return; }
    if (dragWire.kind !== toKind){ cancelDragWire(true); return; }

    // Data type check with wildcard 'any'
    const fromKind = dragWire.kind;
    if (fromKind === 'data'){
      const ckFrom = colorKeyFor(dragWire.fromType);
      const ckTo   = colorKeyFor(toType);
      const wildcard = (String(dragWire.fromType) === 'any' || String(toType) === 'any');
      if (!wildcard && ckFrom !== ckTo){ cancelDragWire(true); return; }
    }

    // Exec outputs: single fan-out
    if (fromKind === 'exec'){
      for (const [id,e] of [...state.edges]){
        if (e.kind!=='exec') continue;
        const sameFrom = e.from.nid===dragWire.from.nid && e.from.pin===dragWire.from.pin;
        if (sameFrom) state.edges.delete(id);
      }
    }

    const edge = {
      id: uid('E'),
      from: dragWire.from,                         // output (right)
      to: { nid: toNid, pin: toPin },              // input (left)
      kind: fromKind,
      fromType: dragWire.fromType,
      colorKey: fromKind==='data' ? colorKeyFor(dragWire.fromType) : null,
    };
    state.edges.set(edge.id, edge);

    // Expand Break Object outputs using the true source type.
    const toNode = state.nodes.get(toNid);
    if (toNode && toNode.defId === 'utils.breakObject' && toPin === 'object' && fromKind === 'data'){
      // Prefer DOM dataset; fall back to node def to be robust.
      const fallType = getOutputType(dragWire.from.nid ? state.nodes.get(dragWire.from.nid)?.defId : null, dragWire.from.pin);
      const sourceType = dragWire.fromType || fallType || 'any';
      applyBreakObjectShape(toNid, sourceType);
    }

    cancelDragWire(false);
    drawWires(); pushHistory(); markDirty(els.dirty);
  });

  // shortcuts
  window.addEventListener('keydown',(e)=>{
    const z = e.key.toLowerCase()==='z';
    const y = e.key.toLowerCase()==='y';
    if ((e.ctrlKey||e.metaKey) && z){ e.preventDefault(); undo(()=>{ renderAll(); applyView(); }); }
    if ((e.ctrlKey||e.metaKey) && y){ e.preventDefault(); redo(()=>{ renderAll(); applyView(); }); }
    if (e.key==='Delete'){
      for (const id of [...state.sel]) state.nodes.delete(id);
      for (const [eid,e] of [...state.edges]) {
        if (state.sel.has(e.from.nid) || state.sel.has(e.to.nid)) state.edges.delete(eid);
      }
      state.sel.clear();
      renderAll(); pushHistory(); markDirty(els.dirty);
    }
    if (e.key==='0' && (e.ctrlKey||e.metaKey)){
      e.preventDefault(); recenter(NODE_W, NODE_H);
    }
  });

  recenter(NODE_W, NODE_H);
}
