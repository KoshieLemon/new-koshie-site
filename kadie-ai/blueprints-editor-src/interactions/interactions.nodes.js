// interactions.nodes.js
// Per-node interactions: selection, context menu, and literal input handling.

import { els } from '../core/dom.js';
import { state, uid, pushHistory, markDirty } from '../core/state.js';
import { renderAll } from '../render/render.editor.js';
import { openActionsMenu } from '../menus/actions-menu.js';
import { applyVisibilityRules, applyEnumLiteralShape } from './interactions.shaping.js';

function isInteractiveTarget(t){
  return !!t.closest?.('input, textarea, select, button, [contenteditable], .pin-input, .literal-wrap');
}

export function enableNodeInteractions(el, model, onStartDrag){
  // Left-click select / multi-select; drag to move selection
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

  // Node context menu
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

  // Persist literal edits and re-evaluate visibility + enum shape
  el.addEventListener('input', (ev)=>{
    const t = ev.target;
    if (!t.classList || !t.classList.contains('pin-input')) return;
    const pinEl = t.closest('.pin');
    if (!pinEl) return;
    const pinName = pinEl.dataset.pin;
    const n = state.nodes.get(model.id);
    if (!n.params) n.params = {};
    n.params[pinName] = t.type === 'checkbox' ? !!t.checked : t.value;

    // Apply visibility rules first, then re-shape enum literal if relevant.
    applyVisibilityRules(model.id);
    applyEnumLiteralShape(model.id);

    markDirty(els.dirty);
    renderAll();
  });
  el.addEventListener('change', (ev)=>{
    const t = ev.target;
    if (!t.classList || !t.classList.contains('pin-input')) return;

    // Ensure enum literal shape is applied on selects as well.
    applyEnumLiteralShape(model.id);

    pushHistory();
  });
}

export function addNodeAt(defId, x, y, params = {}){
  const n = { id: uid('N'), defId, x: Math.round(x), y: Math.round(y), params: { ...(params||{}) } };
  state.nodes.set(n.id, n);
  state.sel.clear(); state.sel.add(n.id);

  // Initialize shape for enum literal nodes immediately.
  applyEnumLiteralShape(n.id);
  applyVisibilityRules(n.id);

  renderAll(); pushHistory(); markDirty(els.dirty);
  return n;
}
