// render.js — typed pins + inline literals + safe reload
import { state } from './state.js';
import { els } from './dom.js';
import { fitSvg } from './render.js'; // self import guarded by bundler tree-shake, safe in browser

let nodeInteractionHook = null;
export function registerNodeInteractions(fn){ nodeInteractionHook = fn; }

/* utils */
function defFor(id){
  return (state.nodesIndex?.nodes || []).find(d => d.id === id) || null;
}
function byKind(arr, kind){ return (arr || []).filter(p => p.type === kind); }
function byData(arr){ return (arr || []).filter(p => p.type !== 'exec'); }
function hasIncomingEdge(nid, pin){
  for (const e of state.edges.values()){
    if (e.to?.nid === nid && e.to?.pin === pin) return true;
  }
  return false;
}
function literalValueToString(type, v){
  if (type === 'boolean') return v ? 'true' : 'false';
  if (v == null) return '';
  return String(v);
}
function parseLiteral(type, raw){
  if (type === 'number') return raw === '' ? null : Number(raw);
  if (type === 'boolean') return !!raw;
  return raw;
}

/* SVG wires */
export function bezierPath(x1,y1,x2,y2){
  const dx = Math.max(60, Math.abs(x2-x1)*0.5);
  const c1x = x1 + dx, c1y = y1;
  const c2x = x2 - dx, c2y = y2;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}
export function getPinCenter(nid, pinName, side){
  const el = document.querySelector(`[data-nid="${nid}"] .pin.${side}[data-pin="${pinName}"] .jack`);
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

/* Node renderer */
function mkPin(side, pinDef){
  const kind = pinDef.type === 'exec' ? 'exec' : 'data';
  const el = document.createElement('div');
  el.className = `pin ${side} ${kind}`;
  el.dataset.pin = pinDef.name;
  el.dataset.kind = kind;
  el.dataset.type = pinDef.type;
  el.innerHTML = `<span class="jack"></span><span class="label">${pinDef.name}</span>`;
  return el;
}

function mkLiteral(n, pinDef){
  // left-data literals only
  const wrap = document.createElement('div');
  wrap.className = 'literal-wrap';
  let input;

  if (pinDef.type === 'boolean'){
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!(n.params?.[pinDef.name]);
  } else {
    input = document.createElement('input');
    input.type = (pinDef.type === 'number') ? 'number' : 'text';
    input.placeholder = pinDef.type;
    input.value = literalValueToString(pinDef.type, n.params?.[pinDef.name]);
  }
  input.className = 'literal';
  input.addEventListener('input', ()=>{
    if (!n.params) n.params = {};
    if (pinDef.type === 'boolean'){
      n.params[pinDef.name] = input.checked;
    } else {
      const v = parseLiteral(pinDef.type, input.value);
      n.params[pinDef.name] = v;
    }
    // markDirty handled by interactions on change via history push
  });
  wrap.appendChild(input);
  return wrap;
}

export function renderNode(n){
  let el = document.querySelector(`.node[data-nid="${n.id}"]`);
  const def = defFor(n.defId);

  if (!el){
    el = document.createElement('div');
    el.className = 'node';
    el.dataset.nid = n.id;

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `<span class="title">${n.defId}</span><span class="hash">#</span>`;
    el.appendChild(header);

    const pins = document.createElement('div');
    pins.className = 'pins';

    // Inputs
    const inputs = document.createElement('div');
    inputs.className = 'side inputs';
    const inExec = def ? byKind(def.inputs, 'exec') : [{name:'in', type:'exec'}];
    const inData = def ? byData(def.inputs)       : [{name:'a', type:'string'}];
    for (const p of [...inExec, ...inData]){
      const pe = mkPin('left', p);
      inputs.appendChild(pe);
      if (p.type !== 'exec'){
        const lit = mkLiteral(n, p);
        pe.appendChild(lit);
      }
    }

    // Outputs
    const outputs = document.createElement('div');
    outputs.className = 'side outputs';
    const outExec = def ? byKind(def.outputs, 'exec') : [{name:'out', type:'exec'}];
    const outData = def ? byData(def.outputs)         : [{name:'b', type:'string'}];
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

  // position + selection
  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  el.classList.toggle('selected', state.sel.has(n.id));

  // toggle literal visibility based on incoming edges
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
  fitSvg?.();
  drawWires();
}
