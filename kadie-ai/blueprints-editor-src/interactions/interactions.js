// interactions.js
// Orchestrator: pan/zoom, marquee, wiring, context menus, and global shortcuts.

import { els } from '../core/dom.js';
import { state, uid, pushHistory, markDirty, undo, redo } from '../core/state.js';
import { renderAll, registerNodeInteractions } from '../render/render.editor.js';
import { drawWires, bezierPath, getPinCenter, fitSvg } from '../render/render.wires.js';
import { openContextMenu } from '../menus/node-menu.js';
import { TYPE_COLORS, colorKeyFor } from '../render/render.types.js';
import { ensureViewport, applyView, unprojectClient, recenter } from './interactions.view.js';

import { ix } from './interactions.ctx.js';
import { ensureWireHint, showHint, hideHint, cancelDragWire, clearLockedWire } from './interactions.hint.js';
import { getDef, getOutputType, applyBreakObjectShape, applyMirrorShape } from './interactions.shaping.js';
import { incomingEdgeId, canConnectToPin, pickAvailableInput } from './interactions.edges.js';
import { ensureMarqueeEl, startMarquee, updateMarquee, finishMarquee } from './interactions.marquee.js';
import { enableNodeInteractions as _enableNodeInteractions, addNodeAt } from './interactions.nodes.js';

// Utility
function isInteractiveTarget(t){
  return !!t.closest?.('input, textarea, select, button, [contenteditable], .pin-input, .literal-wrap');
}

export function initInteractions(){
  ensureViewport();
  ensureMarqueeEl();

  registerNodeInteractions((el, model)=>{
    _enableNodeInteractions(el, model, dragState => { ix.drag = dragState; });
  });

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

  // Prevent browser auto-scroll on middle click
  els.editor.addEventListener('auxclick', (ev)=>{
    if (ev.button === 1){ ev.preventDefault(); }
  });

  // Start wire drag from OUTPUT pins
  els.editor.addEventListener('mousedown', (ev)=>{
    const jack = ev.target.closest?.('.pin .jack');
    if (ev.button === 0 && jack){
      const pinEl = jack.closest('.pin');
      const isRight = pinEl.classList.contains('right');
      if (!isRight) return;
      ev.stopPropagation();

      const kind = pinEl.classList.contains('exec') ? 'exec' : 'data';
      const fromType = pinEl.dataset.type || (kind==='exec' ? 'exec' : 'string');
      const colorKey = kind === 'data' ? colorKeyFor(fromType) : null;

      const nodeEl = pinEl.closest('.node');
      ix.dragWire = {
        from:{ nid: nodeEl.dataset.nid, pin: pinEl.dataset.pin },
        side:'right',
        kind, fromType, colorKey,
        tempPath:null,
        hoverConv:null // set during hover if convertible
      };
      clearLockedWire();
      hideHint();
      ev.preventDefault();
      return;
    }
  }, true);

  // Canvas mousedown: pan or marquee
  els.editor.addEventListener('mousedown', (ev)=>{
    const hitNode = ev.target.closest?.('.node');
    const hitPin  = ev.target.closest?.('.pin, .jack, .label, .literal-wrap, .pin-input');

    if (ev.button === 1 && !hitNode && !hitPin && !ix.dragWire){
      ix.panning = { startX: ev.clientX, startY: ev.clientY, vx: state.view.x, vy: state.view.y };
      ev.preventDefault();
      return;
    }

    if (ev.button === 0 && !hitNode && !hitPin && !ix.dragWire){
      const ae = document.activeElement;
      if (ae && ae.classList?.contains('pin-input')) ae.blur();
      startMarquee(ev);
      ev.preventDefault();
      return;
    }
  });

  // Canvas right-click: open palette
  els.editor.addEventListener('contextmenu', async (ev)=>{
    const hitNode = ev.target.closest?.('.node');
    const hitPin  = ev.target.closest?.('.pin, .jack, .label, .literal-wrap, .pin-input');
    if (hitNode || hitPin) return; // node-level handlers manage their own

    ev.preventDefault();
    const w = unprojectClient(ev.clientX, ev.clientY);
    await openContextMenu(ev.clientX, ev.clientY, (defId)=>{
      addNodeAt(defId, w.x - ix.NODE_W/2, w.y - ix.NODE_H/2);
      renderAll(); pushHistory(); markDirty(els.dirty);
    });
  });

  // Move
  els.editor.addEventListener('mousemove',(ev)=>{
    if (ix.drag){
      const dz = 1 / (state.view.z || 1);
      const dx = (ev.clientX - ix.drag.start.x) * dz;
      const dy = (ev.clientY - ix.drag.start.y) * dz;
      for (const s of ix.drag.startPos){
        const n = state.nodes.get(s.id);
        n.x = Math.round(s.x + dx);
        n.y = Math.round(s.y + dy);
      }
      renderAll(); markDirty(els.dirty);
      return;
    }

    if (ix.dragWire){
      const from = getPinCenter(ix.dragWire.from.nid, ix.dragWire.from.pin, 'right');
      const er = els.editor.getBoundingClientRect();
      const to = { x: ev.clientX - er.left, y: ev.clientY - er.top };
      if (ix.dragWire.tempPath) ix.dragWire.tempPath.remove();
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('class', `wire${ix.dragWire.kind==='data' ? ' data' : ''}`);
      p.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));
      const stroke = ix.dragWire.kind==='data'
        ? (TYPE_COLORS[ix.dragWire.colorKey] || '#94a3b8')
        : '#ffffff';
      p.style.setProperty('--wire', stroke);
      els.wiresSvg.appendChild(p);
      ix.dragWire.tempPath = p;

      const pinEl = ev.target.closest?.('.pin');
      const { status } = canConnectToPin(pinEl);

      // Convertible hint (name-based). Only for data pins.
      if (ix.dragWire.kind === 'data' && pinEl && status !== 'valid' && status !== 'replace'){
        const targetType = pinEl.dataset?.type || 'any';
        const conv = findNameBasedConverter(ix.dragWire.fromType, targetType);
        ix.dragWire.hoverConv = conv;
        if (conv) { showHint('convertible', ev.clientX, ev.clientY); return; }
      }

      showHint(status || '', ev.clientX, ev.clientY);
      return;
    }

    if (ix.panning){
      state.view.x = ix.panning.vx + (ev.clientX - ix.panning.startX);
      state.view.y = ix.panning.vy + (ev.clientY - ix.panning.startY);
      applyView();
      return;
    }

    if (ix.marquee?.active){
      updateMarquee(ev);
    }
  });

  // Mouse up
  window.addEventListener('mouseup', async (ev)=>{
    if (ix.drag){ ix.drag=null; pushHistory(); }

    if (ix.dragWire){
      const pinEl = ev.target.closest?.('.pin');
      const check = canConnectToPin(pinEl);

      if (!pinEl || !check.toNid){
        ix.lockedWire = ix.dragWire;
        ix.dragWire = null;
        hideHint();

        const wx = unprojectClient(ev.clientX, ev.clientY);
        await openContextMenu(ev.clientX, ev.clientY, (defId)=>{
          const n = addNodeAt(defId, wx.x - ix.NODE_W/2, wx.y - ix.NODE_H/2);
          const def = getDef(defId);
          const pin = pickAvailableInput(def, ix.lockedWire.kind, ix.lockedWire.fromType, n.id);
          if (pin){
            const inId = incomingEdgeId(n.id, pin);
            if (inId) state.edges.delete(inId);

            if (ix.lockedWire.kind === 'exec'){
              for (const [id,e] of [...state.edges]){
                if (e.kind!=='exec') continue;
                const sameFrom = e.from.nid===ix.lockedWire.from.nid && e.from.pin===ix.lockedWire.from.pin;
                if (sameFrom) state.edges.delete(id);
              }
            }

            const edge = {
              id: uid('E'),
              from: ix.lockedWire.from,
              to: { nid: n.id, pin },
              kind: ix.lockedWire.kind,
              fromType: ix.lockedWire.fromType,
              colorKey: ix.lockedWire.kind==='data' ? colorKeyFor(ix.lockedWire.fromType) : null,
            };
            state.edges.set(edge.id, edge);

            const toDef = getDef(defId);
            if (ix.lockedWire.kind === 'data' && toDef?.runtime?.shape?.mirrorFrom === pin){
              const fallType   = getOutputType(state.nodes.get(edge.from.nid)?.defId, edge.from.pin);
              const sourceType = ix.lockedWire.fromType || fallType || 'any';
              applyMirrorShape(n.id, toDef, sourceType);
            }
            if (defId === 'utils.breakObject' && ['object','payload'].includes(pin)){
              const fallType   = getOutputType(state.nodes.get(edge.from.nid)?.defId, edge.from.pin);
              const sourceType = ix.lockedWire.fromType || fallType || 'any';
              applyBreakObjectShape(n.id, sourceType, pin);
            }
          }

          clearLockedWire();
          renderAll(); pushHistory(); markDirty(els.dirty);
        });
      } else if (check.status === 'valid' || check.status === 'replace'){
        if (check.replaceId) state.edges.delete(check.replaceId);

        if (ix.dragWire.kind === 'exec'){
          for (const [id,e] of [...state.edges]){
            if (e.kind!=='exec') continue;
            const sameFrom = e.from.nid===ix.dragWire.from.nid && e.from.pin===ix.dragWire.from.pin;
            if (sameFrom) state.edges.delete(id);
          }
        }

        const edge = {
          id: uid('E'),
          from: ix.dragWire.from,
          to: { nid: check.toNid, pin: check.toPin },
          kind: ix.dragWire.kind,
          fromType: ix.dragWire.fromType,
          colorKey: ix.dragWire.kind==='data' ? colorKeyFor(ix.dragWire.fromType) : null,
        };
        state.edges.set(edge.id, edge);

        const toDef = getDef(state.nodes.get(check.toNid)?.defId);
        if (ix.dragWire.kind === 'data' && toDef?.runtime?.shape?.mirrorFrom === check.toPin){
          const fallType   = getOutputType(state.nodes.get(edge.from.nid)?.defId, edge.from.pin);
          const sourceType = ix.dragWire.fromType || fallType || 'any';
          applyMirrorShape(check.toNid, toDef, sourceType);
        }
        if (toDef?.id === 'utils.breakObject' && ['object','payload'].includes(check.toPin)){
          const fallType   = getOutputType(state.nodes.get(edge.from.nid)?.defId, edge.from.pin);
          const sourceType = ix.dragWire.fromType || fallType || 'any';
          applyBreakObjectShape(check.toNid, sourceType, check.toPin);
        }

        cancelDragWire(true);
        renderAll(); pushHistory(); markDirty(els.dirty);
      } else {
        // Auto-insert converter if hover determined it is convertible
        if (ix.dragWire.kind === 'data'){
          const targetType = pinEl?.dataset?.type || 'any';
          const conv = ix.dragWire.hoverConv || findNameBasedConverter(ix.dragWire.fromType, targetType);
          if (conv){
            const mid = midpointWorld(ix.dragWire.from, { nid: check.toNid, pin: check.toPin });
            const converterNid = addNodeAt(conv.nodeId, mid.x - ix.NODE_W/2, mid.y - ix.NODE_H/2).id;

            // Wire: from → converter.in , converter.out → target
            const inPin  = conv.pattern === 'stringToEnum' ? 'value' : 'enum';
            const outPin = conv.pattern === 'stringToEnum' ? 'enum'  : 'value';

            // Remove any replace target if necessary
            if (check.replaceId) state.edges.delete(check.replaceId);
            if (ix.dragWire.kind === 'exec'){
              for (const [id,e] of [...state.edges]){
                if (e.kind!=='exec') continue;
                const sameFrom = e.from.nid===ix.dragWire.from.nid && e.from.pin===ix.dragWire.from.pin;
                if (sameFrom) state.edges.delete(id);
              }
            }

            const e1 = {
              id: uid('E'),
              from: ix.dragWire.from,
              to: { nid: converterNid, pin: inPin },
              kind: 'data',
              fromType: ix.dragWire.fromType,
              colorKey: colorKeyFor(ix.dragWire.fromType)
            };
            state.edges.set(e1.id, e1);

            const e2 = {
              id: uid('E'),
              from: { nid: converterNid, pin: outPin },
              to: { nid: check.toNid, pin: check.toPin },
              kind: 'data',
              fromType: 'string', // enum→string or string→enum; wire color not critical
              colorKey: colorKeyFor('string')
            };
            state.edges.set(e2.id, e2);

            cancelDragWire(true);
            renderAll(); pushHistory(); markDirty(els.dirty);
            return;
          }
        }
        cancelDragWire(true);
      }
    }

    if (ix.panning){ ix.panning=null; }
    if (ix.marquee?.active) finishMarquee(ev);
  });

  // DnD
  els.editor.addEventListener('dragover', (e)=>{ e.preventDefault(); });
  els.editor.addEventListener('drop', (e)=>{
    e.preventDefault();
    const defId = e.dataTransfer.getData('text/x-node-id');
    if (!defId) return;
    let extras = {};
    const json = e.dataTransfer.getData('application/x-node-params');
    if (json){ try{ extras = JSON.parse(json) || {}; } catch {} }
    const w = unprojectClient(e.clientX, e.clientY);
    addNodeAt(defId, w.x - ix.NODE_W/2, w.y - ix.NODE_H/2, extras);
    renderAll();
  });

  // Shortcuts
  window.addEventListener('keydown',(e)=>{
    const z = e.key.toLowerCase()==='z';
    const y = e.key.toLowerCase()==='y';
    if ((e.ctrlKey||e.metaKey) && z){ e.preventDefault(); undo(()=>{ renderAll(); applyView(); }); }
    if ((e.ctrlKey||e.metaKey) && y){ e.preventDefault(); redo(()=>{ renderAll(); applyView(); }); }
    if (e.key==='Delete'){
      for (const id of [...state.sel]) state.nodes.delete(id);
      for (const [eid,ed] of [...state.edges]) {
        if (state.sel.has(ed.from.nid) || state.sel.has(ed.to.nid)) state.edges.delete(eid);
      }
      state.sel.clear();
      renderAll(); pushHistory(); markDirty(els.dirty);
    }
    if (e.key==='0' && (e.ctrlKey||e.metaKey)){
      e.preventDefault(); recenter(ix.NODE_W, ix.NODE_H);
    }
  });

  // Initial
  drawWires();
  fitSvg();
  recenter(ix.NODE_W, ix.NODE_H);
}

/* =============================
   Converter helpers (name-based)
   ============================= */

// Exact type match or 'any'
function sameType(a,b){
  a = String(a||'').trim(); b = String(b||'').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === 'any' || b === 'any') return true;
  return false;
}

// Lazy-load nodes index and search by substring (id or name)
let __NODE_LIST_CACHE = null;
async function loadNodesIndex(){
  if (__NODE_LIST_CACHE) return __NODE_LIST_CACHE;

  const idx = (window && (window.NODE_INDEX || window.NODES_INDEX || window.NODE_DEFS_INDEX)) || null;
  if (idx){
    __NODE_LIST_CACHE = Array.isArray(idx?.nodes) ? idx.nodes :
                        Array.isArray(idx)        ? idx        :
                        Array.isArray(idx?.list)  ? idx.list   : [];
    return __NODE_LIST_CACHE;
  }

  const tryPaths = [
    '../providers/nodes-index.js',
    '../nodes-index.js',
    '/kadie-ai/blueprints-editor-src/providers/nodes-index.js',
    '/kadie-ai/blueprints-editor-src/nodes-index.js',
  ];
  for (const p of tryPaths){
    try{
      const m = await import(/* @vite-ignore */ p);
      const r = typeof m.fetchNodesIndex==='function' ? await m.fetchNodesIndex() : m;
      __NODE_LIST_CACHE = Array.isArray(r?.nodes) ? r.nodes :
                          Array.isArray(r)        ? r        :
                          Array.isArray(r?.list)  ? r.list   : [];
      return __NODE_LIST_CACHE;
    }catch(_){}
  }
  __NODE_LIST_CACHE = [];
  return __NODE_LIST_CACHE;
}
function hasNodeNameLike(list, needle){
  const q = String(needle||'').toLowerCase();
  for (const def of list){
    if (!def) continue;
    const id = String(def.id||'').toLowerCase();
    const nm = String(def.name||'').toLowerCase();
    if (id.includes(q) || nm.includes(q)) return def.id;
  }
  return null;
}

// Decide converter by names only.
// Rule: if target is string and source is not string → enumToString (if present).
//       if source is string and target is not string → stringToEnum (if present).
function findNameBasedConverter(fromType, toType){
  if (sameType(fromType, toType)) return null;
  const f = String(fromType||'').trim();
  const t = String(toType||'').trim();
  if (!f || !t) return null;

  const nodes = __NODE_LIST_CACHE; // assume init during hover; safe if null
  if (!nodes || !nodes.length) return null;

  if (t === 'string' && f !== 'string'){
    const nodeId = hasNodeNameLike(nodes, 'enumtostring');
    if (nodeId) return { nodeId, pattern:'enumToString' };
  }
  if (f === 'string' && t !== 'string'){
    const nodeId = hasNodeNameLike(nodes, 'stringtoenum');
    if (nodeId) return { nodeId, pattern:'stringToEnum' };
  }
  return null;
}

// Compute world-space midpoint between two pins
function midpointWorld(from, to){
  const a = getPinCenter(from.nid, from.pin, 'right');
  const b = getPinCenter(to.nid,   to.pin,   'left');
  const mx = Math.round((a.x + b.x) / 2);
  const my = Math.round((a.y + b.y) / 2);
  const er = els.editor.getBoundingClientRect();
  return unprojectClient(er.left + mx, er.top + my);
}

// Prime node index early (non-blocking)
(function primeIndex(){ loadNodesIndex().catch(()=>{}); })();
