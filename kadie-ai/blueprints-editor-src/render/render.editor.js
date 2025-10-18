// Editor renderer that uses the universal node builder.
import { state } from '../core/state.js';
import { els } from '../core/dom.js';
import { buildNodeDOM } from './render.node.js';
import { fitSvg, drawWires } from './render.wires.js';

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

  // evaluate rules
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
  // allow any prior dynamic overrides (e.g., Break Object) then apply visibility
  const source = n._defOverride ? n._defOverride : base;
  const def  = applyParamVisibility(source, (n.params||{}), n.id);

  const el = buildNodeDOM(def, { preview:false, params: (n.params||{}), nid: n.id });

  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  els.nodesLayer.appendChild(el);

  if (nodeInteractionHook) nodeInteractionHook(el, n);

  // show literals for unwired left data pins
  for (const pin of el.querySelectorAll('.pin.left.data')){
    const name = pin.dataset.pin;
    const wired = hasIncomingEdge(n.id, name);
    const lit = pin.querySelector('.literal-wrap');
    if (lit) lit.style.display = wired ? 'none' : '';
  }

  el.classList.toggle('selected', state.sel.has(n.id));
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
