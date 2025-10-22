import { els } from '../core/dom.js';
import { state, uid, pushHistory, markDirty } from '../core/state.js';
import { renderAll } from '../render/render.editor.js';
import { openActionsMenu } from '../menus/actions-menu.js';
import { applyVisibilityRules, applyEnumLiteralShape } from './interactions.shaping.js';
import { colorKeyFor, cssToken } from '../render/render.types.js';

function isInteractiveTarget(t){
  return !!t.closest?.('input, textarea, select, button, [contenteditable], .pin-input, .literal-wrap');
}

function normEnumValue(v){
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object'){
    if ('value' in v && v.value != null) return String(v.value);
    if ('name'  in v && v.name  != null) return String(v.name);
    if ('key'   in v && v.key   != null) return String(v.key);
  }
  return String(v);
}
function getBaseDefById(defId){
  const list = (state.nodesIndex?.nodes || window.NODE_INDEX || []);
  return list.find(d => d.id === defId) || (window.NODE_DEFS && window.NODE_DEFS[defId]) || null;
}

function getDynamicOutputConfig(n){
  const base = getBaseDefById(n.defId);
  return (n._defOverride?.ui?.dynamicOutputFromParam) || (base?.ui?.dynamicOutputFromParam) || null;
}
function getDynamicInputConfig(n){
  const base = getBaseDefById(n.defId);
  return (n._defOverride?.ui?.dynamicInputFromParam) || (base?.ui?.dynamicInputFromParam) || null;
}
function getDynamicType(n, cfg){
  if (!cfg || !cfg.param) return '';
  const chosen = normEnumValue(n.params?.[cfg.param]);
  return chosen || '';
}

function repaintPinType(side, nid, cfg){
  if (!cfg || !cfg.pin) return;
  const n = state.nodes.get(nid); if (!n) return;
  const chosen = getDynamicType(n, cfg);
  if (!chosen) return;

  const nodeEl = document.querySelector(`.node[data-nid="${nid}"]`);
  if (!nodeEl) return;

  const selector = side === 'out'
    ? `.side.outputs .pin.right[data-pin="${cfg.pin}"]`
    : `.side.inputs  .pin.left[data-pin="${cfg.pin}"]`;

  const pinEl = nodeEl.querySelector(selector) ||
                nodeEl.querySelector(side === 'out' ? '.side.outputs .pin.right' : '.side.inputs .pin.left');
  if (!pinEl) return;

  pinEl.dataset.type = chosen;

  for (const c of [...pinEl.classList]) if (c.startsWith('t-')) pinEl.classList.remove(c);
  const colorKey = colorKeyFor(chosen || 'string');
  pinEl.classList.add(`t-${cssToken(colorKey)}`);

  const label = pinEl.querySelector('.label');
  if (label) label.title = chosen;
}

function repaintDynamicTypes(nid){
  const n = state.nodes.get(nid); if (!n) return;
  repaintPinType('out', nid, getDynamicOutputConfig(n));
  repaintPinType('in',  nid, getDynamicInputConfig(n));
}

// ---- plus-button actions for makeArray
window.addEventListener('makeArray:addItem', (ev)=>{
  const nid = ev?.detail?.nid;
  if (!nid) return;
  const n = state.nodes.get(nid);
  if (!n) return;
  if (!n.params) n.params = {};
  let maxIdx = 1;
  for (const k of Object.keys(n.params)){
    const m = /^item(\d+)$/.exec(k);
    if (m) maxIdx = Math.max(maxIdx, Number(m[1]));
  }
  const next = maxIdx + 1;
  n.params[`item${next}`] = '';
  renderAll();
  pushHistory();
  markDirty(els.dirty);
});

export function enableNodeInteractions(el, model, onStartDrag){
  el.addEventListener('mousedown', (ev)=>{
    if (ev.button!==0) return;
    if (isInteractiveTarget(ev.target)) return;

    const ae = document.activeElement;
    if (ae && ae.classList?.contains('pin-input') && !el.contains(ae)) ae.blur();

    const additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;

    if (additive) {
      if (state.sel.has(model.id)) state.sel.delete(model.id);
      else state.sel.add(model.id);
      renderAll();
    } else if (!state.sel.has(model.id)) {
      state.sel.clear();
      state.sel.add(model.id);
      renderAll();
    }

    const start = { x: ev.clientX, y: ev.clientY };
    const startPos = [...state.sel].map(id => {
      const n = state.nodes.get(id);
      return { id, x: n.x, y: n.y };
    });
    onStartDrag({ start, startPos });
    ev.preventDefault();
  });

  el.addEventListener('contextmenu', (ev)=>{
    if (isInteractiveTarget(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();

    openActionsMenu(ev.clientX, ev.clientY, {
      onDuplicate: ()=>{
        const src = state.nodes.get(model.id);
        if (!src) return;
        const n = structuredClone(src);
        n.id = uid('N'); n.x += 24; n.y += 24;
        state.nodes.set(n.id, n);
        state.sel.clear(); state.sel.add(n.id);
        renderAll(); pushHistory(); markDirty(els.dirty);
        repaintDynamicTypes(n.id);
      },
      onDelete: ()=>{
        state.nodes.delete(model.id);
        for (const [id,e] of [...state.edges]) {
          if (e.from.nid===model.id || e.to.nid===model.id) state.edges.delete(id);
        }
        renderAll(); pushHistory(); markDirty(els.dirty);
      }
    });
  });

  el.addEventListener('input', (ev)=>{
    const t = ev.target;
    if (!t.classList || !t.classList.contains('pin-input')) return;
    const pinEl = t.closest('.pin');
    if (!pinEl) return;
    const pinName = pinEl.dataset.pin;
    const n = state.nodes.get(model.id);
    if (!n.params) n.params = {};

    let nextVal;
    if (t.dataset && typeof t.dataset.jsonValue === 'string'){
      try { nextVal = JSON.parse(t.dataset.jsonValue); } catch { nextVal = t.value; }
    } else {
      nextVal = t.type === 'checkbox' ? !!t.checked : t.value;
    }
    n.params[pinName] = nextVal;

    const cs = getComputedStyle(t);
    const w = parseFloat(cs.width)  || t.offsetWidth  || 0;
    const h = parseFloat(cs.height) || t.offsetHeight || 0;
    n._ui = n._ui || {};
    n._ui.literals = n._ui.literals || {};
    const prev = n._ui.literals[pinName] || { w: 0, h: 0 };
    n._ui.literals[pinName] = { w: Math.max(prev.w||0, w), h: Math.max(prev.h||0, h) };

    markDirty(els.dirty);
    window.dispatchEvent(new CustomEvent('wires:soft-input', { detail:{ nid: model.id, pin: pinName } }));
  });

  el.addEventListener('change', (ev)=>{
    const t = ev.target;
    if (!t.classList || !t.classList.contains('pin-input')) return;

    const pinEl = t.closest('.pin');
    if (pinEl){
      const pinName = pinEl.dataset.pin;
      const n = state.nodes.get(model.id);
      if (!n.params) n.params = {};
      let nextVal;
      if (t.dataset && typeof t.dataset.jsonValue === 'string'){
        try { nextVal = JSON.parse(t.dataset.jsonValue); } catch { nextVal = t.value; }
      } else {
        nextVal = t.type === 'checkbox' ? !!t.checked : t.value;
      }
      n.params[pinName] = nextVal;

      const cs = getComputedStyle(t);
      const w = parseFloat(cs.width)  || t.offsetWidth  || 0;
      const h = parseFloat(cs.height) || t.offsetHeight || 0;
      n._ui = n._ui || {};
      n._ui.literals = n._ui.literals || {};
      const prev = n._ui.literals[pinName] || { w: 0, h: 0 };
      n._ui.literals[pinName] = { w: Math.max(prev.w||0, w), h: Math.max(prev.h||0, h) };
    }

    applyEnumLiteralShape(model.id);
    applyVisibilityRules(model.id);

    pushHistory();
    markDirty(els.dirty);
    renderAll();

    window.requestAnimationFrame(()=>{
      const nodeEl = document.querySelector(`.node[data-nid="${model.id}"]`);
      if (nodeEl){
        for (const [pin, sz] of Object.entries(state.nodes.get(model.id)?._ui?.literals || {})){
          const pinEl = nodeEl.querySelector(`.pin[data-pin="${pin}"] .pin-input`);
          if (pinEl){
            if (sz.w) pinEl.style.width  = `${sz.w}px`;
            if (sz.h) pinEl.style.height = `${sz.h}px`;
          }
        }
      }
    });

    repaintDynamicTypes(model.id);
    window.dispatchEvent(new CustomEvent('wires:recalc', { detail:{ nid: model.id } }));
  });
}

export function addNodeAt(defId, x, y, params = {}){
  const n = { id: uid('N'), defId, x: Math.round(x), y: Math.round(y), params: { ...(params||{}) } };
  state.nodes.set(n.id, n);
  state.sel.clear(); state.sel.add(n.id);

  applyEnumLiteralShape(n.id);
  applyVisibilityRules(n.id);

  renderAll();

  repaintDynamicTypes(n.id);

  pushHistory(); markDirty(els.dirty);
  return n;
}
