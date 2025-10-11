import { state, hasIncomingEdge, setParam, getParam } from './state.js';
import { els } from './dom.js';
import { registerNodeInteractions } from './events-ui.js';
import { typeColor, isInlineEditableType } from './nodes-index.js';

let nodeInteractionHook = null;
export function registerNodeInteractions(fn){ nodeInteractionHook = fn; } // kept API compatibility

export function fitSvg(){
  const r = els.editor.getBoundingClientRect();
  els.wiresSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
}

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

function pinRow(side, pin, def, node){
  const type = pin.type || 'exec';
  const el = document.createElement('div');
  el.className = `pin ${side} ${type === 'exec' ? 'exec' : 'data'}`;
  el.dataset.pin = pin.name;

  const jack = document.createElement('span');
  jack.className = 'jack';
  jack.style.backgroundColor = typeColor(type);

  const label = document.createElement('span');
  label.textContent = pin.name;
  label.style.color = '#cbd5e1';

  el.appendChild(jack);
  el.appendChild(label);

  if (side === 'left' && type !== 'exec' && isInlineEditableType(type, def, pin.name)) {
    const wired = hasIncomingEdge(node.id, pin.name);
    const wrap = document.createElement('span');
    wrap.className = 'inline-input';
    wrap.style.marginLeft = '8px';

    let input;
    if (type === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(getParam(node.id, pin.name));
      input.onchange = () => setParam(node.id, pin.name, input.checked);
    } else {
      input = document.createElement('input');
      input.type = (type === 'number' || type === 'int' || type === 'float') ? 'number' : 'text';
      input.value = getParam(node.id, pin.name) ?? '';
      input.placeholder = def?.ui?.inputsMeta?.[pin.name]?.placeholder || '';
      input.oninput = () => setParam(node.id, pin.name, input.value);
    }

    wrap.appendChild(input);
    wrap.style.display = wired ? 'none' : 'inline-block';
    el.appendChild(wrap);
  }

  return el;
}

export function renderNode(n){
  let el = document.querySelector(`.node[data-nid="${n.id}"]`);
  const def = state.nodesIndex.nodes.find(x => x.id === n.defId) || { inputs:[], outputs:[] };

  if (!el){
    el = document.createElement('div');
    el.className = 'node';
    el.dataset.nid = n.id;
    el.innerHTML = `
      <div class="header">
        <span>${n.defId}</span>
        <span style="opacity:.6;font-size:12px;user-select:none">#</span>
      </div>
      <div class="pins"></div>
    `;
    els.nodesLayer.appendChild(el);
    if (nodeInteractionHook) nodeInteractionHook(el, n);
  }

  // rebuild pins
  const pins = el.querySelector('.pins');
  pins.innerHTML = '';

  // inputs (left)
  for (const p of def.inputs || []){
    pins.appendChild(pinRow('left', p, def, n));
  }
  // default exec input if none defined
  if (!(def.inputs||[]).some(p=>p.type==='exec')) {
    pins.appendChild(pinRow('left', { name:'in', type:'exec' }, def, n));
  }

  // outputs (right)
  for (const p of def.outputs || []){
    const row = pinRow('right', p, def, n);
    pins.appendChild(row);
  }
  // default exec out if none defined
  if (!(def.outputs||[]).some(p=>p.type==='exec')) {
    pins.appendChild(pinRow('right', { name:'out', type:'exec' }, def, n));
  }

  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  el.classList.toggle('selected', state.sel.has(n.id));
}

export function renderAll(){
  els.nodesLayer.innerHTML = '';
  for (const n of state.nodes.values()) renderNode(n);
  drawWires();
}
