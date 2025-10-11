import { state } from './state.js';
import { els } from './dom.js';

let nodeInteractionHook = null;
export function registerNodeInteractions(fn){ nodeInteractionHook = fn; }

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

export function renderNode(n){
  let el = document.querySelector(`.node[data-nid="${n.id}"]`);
  if (!el){
    el = document.createElement('div');
    el.className = 'node';
    el.dataset.nid = n.id;
    el.innerHTML = `
      <div class="header">
        <span>${n.defId}</span>
        <span style="opacity:.6;font-size:12px;user-select:none">#</span>
      </div>
      <div class="pins">
        <div class="pin left exec" data-pin="in"><span class="jack"></span><span>in</span></div>
        <div class="pin right exec" data-pin="out"><span class="jack"></span><span>out</span></div>
        <div class="pin left data" data-pin="a"><span class="jack"></span><span>a</span></div>
        <div class="pin right data" data-pin="b"><span class="jack"></span><span>b</span></div>
      </div>
    `;
    els.nodesLayer.appendChild(el);
    if (nodeInteractionHook) nodeInteractionHook(el, n);
  }
  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  el.classList.toggle('selected', state.sel.has(n.id));
}

export function renderAll(){
  els.nodesLayer.innerHTML = '';
  for (const n of state.nodes.values()) renderNode(n);
  drawWires();
}