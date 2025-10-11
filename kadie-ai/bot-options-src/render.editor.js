// Editor renderer that uses the universal node builder.
import { state } from './state.js';
import { els } from './dom.js';
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

export function renderNode(n){
  const def = defFor(n.defId);
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
  for (const n of state.nodes.values()) renderNode(n);
  fitSvg();
  drawWires();
}
