// Editor renderer
import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { buildNodeDOM } from './render.node.js';
import { fitSvg, drawWires } from './render.wires.js';

let nodeInteractionHook = null;
export function registerNodeInteractions(fn){ nodeInteractionHook = fn; }

// Lookup a node definition by id from the preloaded index or globals
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

// Hide pins per def.runtime.shape.hideWhen rules, drop wires to hidden pins, scrub params
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

  // Drop wires to hidden INPUT pins
  for (const [eid, e] of state.edges){
    if (e.to?.nid === nid && hiddenIn.has(e.to.pin)) state.edges.delete(eid);
  }
  // Scrub saved params for hidden inputs
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
  const source = n._defOverride ? n._defOverride(base, n) : base;
  const def = applyParamVisibility(source, n.params, n.id);

  const el = buildNodeDOM(def, n);
  el.dataset.nid = String(n.id);
  el.style.left = `${Math.round(n.x||0)}px`;
  el.style.top  = `${Math.round(n.y||0)}px`;

  if (nodeInteractionHook) nodeInteractionHook(el, n);

  return el;
}

export function renderAll(){
  const countN = state.nodes instanceof Map ? state.nodes.size : 0;
  const countE = state.edges instanceof Map ? state.edges.size : 0;
  console.info('[BP DEBUG] renderAll:start', `nodes=${countN}`, `edges=${countE}`);

  els.nodesLayer.replaceChildren();  // clear
  const frag = document.createDocumentFragment();
  for (const n of state.nodes.values()){
    try{
      const el = renderNode(n);
      frag.appendChild(el);
    }catch(err){
      console.error('[render] node failed:', n?.id, err);
    }
  }
  els.nodesLayer.appendChild(frag);

  // Wires and SVG fit need up-to-date layout boxes
  fitSvg();
  drawWires();

  console.info('[BP DEBUG] renderAll:done',
    `inDOM=${els.nodesLayer.querySelectorAll('.node').length}`
  );
}
