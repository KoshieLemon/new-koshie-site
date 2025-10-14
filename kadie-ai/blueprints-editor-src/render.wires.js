// Wire utilities and geometry (screen-space rendering; no clipping)
import { els } from './dom.js';
import { state } from './state.js';
import { TYPE_COLORS, colorKeyFor } from './render.types.js';

if (!state.view) state.view = { x: 0, y: 0, z: 1 };

export function fitSvg(){
  const r = els.editor.getBoundingClientRect();
  els.wiresSvg.setAttribute('width', r.width);
  els.wiresSvg.setAttribute('height', r.height);
  // Screen-space: 1 unit == 1 CSS pixel in the editor
  els.wiresSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
}

export function bezierPath(x1,y1,x2,y2){
  const dx = Math.max(60, Math.abs(x2-x1)*0.5);
  const c1x = x1 + dx, c1y = y1;
  const c2x = x2 - dx, c2y = y2;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

// Screen-space center of a pin's jack relative to editor
export function getPinCenter(nid, pinName, side){
  const jack = document.querySelector(
    `[data-nid="${nid}"] .pin.${side}[data-pin="${pinName}"] .jack`
  );
  if (!jack) return null;
  const er = els.editor.getBoundingClientRect();
  const r = jack.getBoundingClientRect();
  return { x: r.left - er.left + r.width/2, y: r.top - er.top + r.height/2 };
}

export function drawWires(){
  els.wiresSvg.innerHTML = '';
  for (const e of state.edges.values()){
    const from = getPinCenter(e.from.nid, e.from.pin, 'right');
    const to   = getPinCenter(e.to.nid,   e.to.pin,   'left');
    if (!from || !to) continue;

    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('class', 'wire');
    p.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));

    // Color: exec = white; data inherits source type color
    let stroke = '#ffffff';
    if (e.kind === 'data'){
      let key = e.colorKey || (e.fromType ? colorKeyFor(e.fromType) : null);
      if (!key){
        const fromPinEl = document.querySelector(
          `[data-nid="${e.from.nid}"] .pin.right[data-pin="${e.from.pin}"]`
        );
        const dt = fromPinEl?.dataset?.type;
        if (dt) key = colorKeyFor(dt);
      }
      stroke = TYPE_COLORS[key] || '#94a3b8';
    }
    p.style.setProperty('--wire', stroke);

    els.wiresSvg.appendChild(p);
  }
}
