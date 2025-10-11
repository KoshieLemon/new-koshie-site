// render.js — typed pins, inline literals, safe redraw + robust def fallback + debug
import { state } from './state.js';
import { els } from './dom.js';

let nodeInteractionHook = null;
export function registerNodeInteractions(fn){ nodeInteractionHook = fn; }

/* ---------- utils ---------- */
function defFor(defId){
  // Try state first, then global debug cache populated by nodes-index.js
  const list = (state.nodesIndex?.nodes || []);
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

function execPins(arr){ return (arr || []).filter(p => p.type === 'exec'); }
function dataPins(arr){ return (arr || []).filter(p => p.type !== 'exec'); }
function hasIncomingEdge(nid, pin){
  for (const e of state.edges.values()){
    if (e.to?.nid === nid && e.to?.pin === pin) return true;
  }
  return false;
}
function toStr(type, v){
  if (type === 'boolean') return v ? 'true' : 'false';
  if (v == null) return '';
  return String(v);
}
function parseLiteral(type, raw){
  if (type === 'number' || type === 'float' || type === 'int'){
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'boolean') return !!raw;
  return raw;
}

/* ---------- svg wires ---------- */
export function fitSvg(){
  const r = els.editor.getBoundingClientRect();
  els.wiresSvg.setAttribute('width', r.width);
  els.wiresSvg.setAttribute('height', r.height);
  els.wiresSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
}

export function bezierPath(x1,y1,x2,y2){
  const dx = Math.max(60, Math.abs(x2-x1)*0.5);
  const c1x = x1 + dx, c1y = y1;
  const c2x = x2 - dx, c2y = y2;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

export function getPinCenter(nid, pinName, side){
  const el = document.querySelector(
    `[data-nid="${nid}"] .pin.${side}[data-pin="${pinName}"] .jack`
  );
  if (!el) return null;
  const er = els.editor.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - er.left + r.width/2, y: r.top - er.top + r.height/2 };
}

export function drawWires(){
  els.wiresSvg.innerHTML = '';
  for (const e of state.edges.values()){
    const from = getPinCenter(e.from.nid, e.from.pin, 'right');
    const to   = getPinCenter(e.to.nid,   e.to.pin,   'left');
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('class', `wire ${e.kind==='data'?'data':''}`);
    path.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));
    els.wiresSvg.appendChild(path);
  }
}

/* ---------- node UI ---------- */
function mkPin(side, pinDef){
  const kind = pinDef.type === 'exec' ? 'exec' : 'data';
  const el = document.createElement('div');
  el.className = `pin ${side} ${kind} ${kind==='data' ? (pinDef.type || 'string') : ''}`;
  el.dataset.pin  = pinDef.name;
  el.dataset.kind = kind;
  el.dataset.type = pinDef.type || 'string';
  el.innerHTML = `<span class="jack"></span><span class="label">${pinDef.name}</span>`;
  return el;
}

function mkLiteral(n, pinDef){
  const wrap = document.createElement('div');
  wrap.className = 'literal-wrap';
  let input;

  if (pinDef.type === 'boolean'){
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!(n.params?.[pinDef.name]);
    input.addEventListener('change',()=>{
      if (!n.params) n.params = {};
      n.params[pinDef.name] = input.checked;
    });
  } else {
    input = document.createElement('input');
    input.type = (pinDef.type === 'number' || pinDef.type === 'float' || pinDef.type === 'int') ? 'number' : 'text';
    input.placeholder = pinDef.type || 'string';
    input.value = toStr(pinDef.type, n.params?.[pinDef.name]);
    input.className = 'literal';
    input.addEventListener('input',()=>{
      if (!n.params) n.params = {};
      n.params[pinDef.name] = parseLiteral(pinDef.type, input.value);
    });
  }
  input.classList.add('pin-input');
  wrap.appendChild(input);
  return wrap;
}

export function renderNode(n){
  let el = document.querySelector(`.node[data-nid="${n.id}"]`);
  const def = defFor(n.defId);

  // ---- DEBUG per-node shape the UI will use ----
  if (!def) {
    console.warn('[render] using defaults for node with missing def:', n.defId);
  } else {
    console.debug('[render] def for', n.defId, {
      inputs: def.inputs?.map(p=>`${p.name}:${p.type}`) || [],
      outputs: def.outputs?.map(p=>`${p.name}:${p.type}`) || [],
      kind: def.kind
    });
  }
  // ---------------------------------------------

  if (!el){
    el = document.createElement('div');
    el.className = 'node';
    el.dataset.nid = n.id;

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `<span class="title">${n.defId}</span>`;
    el.appendChild(header);

    const pins = document.createElement('div');
    pins.className = 'pins';

    const inputs = document.createElement('div');
    inputs.className = 'side inputs';
    // Fallback ONLY when the def is missing
    const inExec = def ? execPins(def.inputs) : [{name:'in', type:'exec'}];
    const inData = def ? dataPins(def.inputs) : [];
    for (const p of [...inExec, ...inData]){
      const pe = mkPin('left', p);
      inputs.appendChild(pe);
      if (p.type !== 'exec'){
        const wired = hasIncomingEdge(n.id, p.name);
        const lit = mkLiteral(n, p);
        lit.style.display = wired ? 'none' : '';
        pe.appendChild(lit);
      }
    }

    const outputs = document.createElement('div');
    outputs.className = 'side outputs';
    const outExec = def ? execPins(def.outputs) : [{name:'out', type:'exec'}];
    const outData = def ? dataPins(def.outputs) : [];
    for (const p of [...outExec, ...outData]){
      const pe = mkPin('right', p);
      outputs.appendChild(pe);
    }

    pins.appendChild(inputs);
    pins.appendChild(outputs);
    el.appendChild(pins);

    els.nodesLayer.appendChild(el);
    if (nodeInteractionHook) nodeInteractionHook(el, n);
  }

  // position and selection state
  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  el.classList.toggle('selected', state.sel.has(n.id));

  // toggle literal visibility when wiring changes
  for (const pin of el.querySelectorAll('.pin.left.data')){
    const name = pin.dataset.pin;
    const wired = hasIncomingEdge(n.id, name);
    const lit = pin.querySelector('.literal-wrap');
    if (lit) lit.style.display = wired ? 'none' : '';
  }
}

export function renderAll(){
  els.nodesLayer.innerHTML = '';
  for (const n of state.nodes.values()) renderNode(n);
  fitSvg();
  drawWires();
}
