// /bot-options-src/interactions.js
// Graph interactions: selection, drag, pan/zoom, wiring, context menus,
// DnD from node menu and Guild Browser, inline literal editing persistence.

import { els } from './dom.js';
import { state, uid, pushHistory, markDirty, undo, redo } from './state.js';
import { renderAll, registerNodeInteractions } from './render.editor.js';
import { drawWires, bezierPath, getPinCenter } from './render.wires.js';
import { openContextMenu } from './menu.js';
import { TYPE_COLORS, colorKeyFor, DISCORD_SHAPES, toFinalPrimitive } from './render.types.js';
import { ensureViewport, applyView, unprojectClient, positionCtxMenuAt, recenter } from './interactions.view.js';

// ---- init guards
if (!state.nodes) state.nodes = new Map();
if (!state.edges) state.edges = new Map();
if (!state.sel)   state.sel   = new Set();
if (!state.view)  state.view  = { x: 0, y: 0, z: 1 };

const NODE_W = 200;
const NODE_H = 92;

let drag = null;           // dragging selected nodes
let dragWire = null;       // active wire being drawn
let panning = null;        // dragging the canvas

function isInteractiveTarget(t){
  return !!t.closest?.('input, textarea, select, button, [contenteditable], .pin-input, .literal-wrap');
}

function cancelDragWire(redraw){
  if (dragWire?.tempPath){ dragWire.tempPath.remove(); dragWire.tempPath = null; }
  dragWire = null;
  if (redraw) drawWires();
}

// ---- node def helpers
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

// ---- per-node interactions (drag, context menu, literals, start wire)
function enableNodeInteractions(el, model){
  // drag node
  el.addEventListener('mousedown', (ev)=>{
    if (ev.button !== 0) return;
    if (isInteractiveTarget(ev.target)) return;

    // focus management for inline inputs
    const ae = document.activeElement;
    if (ae && ae.classList?.contains('pin-input') && !el.contains(ae)) ae.blur();

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

  // node context menu (Duplicate/Delete)
  el.addEventListener('contextmenu', (ev)=>{
    if (isInteractiveTarget(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation(); // prevents canvas palette

    els.ctxMenu.innerHTML = '';
    positionCtxMenuAt(ev.clientX, ev.clientY);

    const mk = (label,fn)=>{
      const d=document.createElement('div');
      d.className='menu-item';
      d.textContent=label;
      d.addEventListener('click', ()=>{ fn(); els.ctxMenu.style.display='none';});
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
      for (const [id,e] of state.edges) {
        if (e.from.nid===model.id || e.to.nid===model.id) state.edges.delete(id);
      }
      renderAll(); pushHistory(); markDirty(els.dirty);
    }));

    window.addEventListener('click', ()=>{ els.ctxMenu.style.display='none'; }, { once:true });
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

  // persist literal edits immediately (params live on node)
  el.addEventListener('input', (ev)=>{
    const t = ev.target;
    if (!t.classList || !t.classList.contains('pin-input')) return;
    const pinEl = t.closest('.pin'); if (!pinEl) return;
    const pinName = pinEl.dataset.pin;
    const n = state.nodes.get(model.id);
    if (!n.params) n.params = {};
    n.params[pinName] = t.type === 'checkbox' ? !!t.checked : t.value;
    markDirty(els.dirty);
  });
  el.addEventListener('change', ()=>{
    pushHistory(); // commit on blur/enter
  });
}

// ---- node creation
function addNodeAt(defId, x, y, params = {}){
  const n = { id: uid('N'), defId, x: Math.round(x), y: Math.round(y), params: { ...(params||{}) } };
  state.nodes.set(n.id, n);
  state.sel.clear(); state.sel.add(n.id);
  renderAll(); pushHistory(); markDirty(els.dirty);
}

// ---- exported initializer
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

  // Left-drag panning on blank space. Also exit any active input cleanly.
  els.editor.addEventListener('mousedown', (ev)=>{
    if (ev.button === 0){
      const hitNode = ev.target.closest?.('.node');
      const hitPin  = ev.target.closest?.('.pin, .jack, .label, .literal-wrap, .pin-input');

      const ae = document.activeElement;
      if (ae && ae.classList?.contains('pin-input') && !ev.target.closest('.pin-input')) ae.blur();

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
      const from = getPinCenter(dragWire.from.nid, 'right', dragWire.from.pin);
      const er = els.editor.getBoundingClientRect();
      const to = { x: ev.clientX - er.left, y: ev.clientY - er.top };
      if (dragWire.tempPath) dragWire.tempPath.remove();
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('class', `wire${dragWire.kind==='data' ? ' data' : ''}`);
      const stroke = dragWire.kind==='data'
        ? (TYPE_COLORS[dragWire.colorKey] || '#93c5fd')
        : '#9ca3af';
      p.style.setProperty('--wire', stroke);
      p.setAttribute('stroke', stroke);
      p.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));
      els.wiresSvg.appendChild(p);
      dragWire.tempPath = p;
    } else if (panning){
      const dx = ev.clientX - panning.startX;
      const dy = ev.clientY - panning.startY;
      state.view.x = panning.vx + dx;
      state.view.y = panning.vy + dy;
      applyView();
    }
  });

  els.editor.addEventListener('mouseup', (ev)=>{
    if (drag){
      drag = null;
      pushHistory();
      return;
    }
    if (!dragWire) return;

    const pinEl = ev.target.closest?.('.pin.left');
    if (!pinEl) { cancelDragWire(true); return; }

    const toNodeEl = pinEl.closest('.node');
    const toNid = toNodeEl?.dataset?.nid;
    const toPin = pinEl.dataset.pin;
    const fromKind = dragWire.kind;
    const toKind = pinEl.classList.contains('exec') ? 'exec' : 'data';

    // Type direction and kind checks
    if (fromKind !== toKind) { cancelDragWire(true); return; }
    if (fromKind === 'exec' && pinEl.classList.contains('right')) { cancelDragWire(true); return; }

    // Enforce single incoming edge per input pin
    for (const [id,e] of state.edges) {
      if (e.to.nid === toNid && e.to.pin === toPin) state.edges.delete(id);
    }

    // Exec outputs: single fan-out
    if (fromKind === 'exec'){
      for (const [id,e] of state.edges){
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
      type: dragWire.fromType || null,
    };
    state.edges.set(edge.id, edge);

    // Expand Break Object outputs using the true source type
    const toNode = state.nodes.get(toNid);
    if (toNode && toNode.defId === 'utils.breakObject' && toPin === 'object' && fromKind === 'data'){
      const fallType = getOutputType(state.nodes.get(dragWire.from.nid)?.defId, dragWire.from.pin);
      const sourceType = dragWire.fromType || fallType || 'any';
      applyBreakObjectShape(toNid, sourceType);
    }

    renderAll();
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
      for (const [eid,e] of state.edges) {
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
