// /bot-options-src/render.wires.js
import { els } from './dom.js';
import { state } from './state.js';
import { TYPE_COLORS, colorKeyFor } from './render.types.js';

export function fitSvg() {
  if (!els.editor || !els.wiresSvg) return;
  const r = els.editor.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  els.wiresSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
}

export function getPinCenter(nid, side, pinName) {
  const node = document.querySelector(`.node[data-nid="${CSS.escape(nid)}"]`);
  if (!node) return null;
  const sel = side === 'right'
    ? `.pin.right[data-pin="${CSS.escape(pinName)}"] .jack, .pin.right .jack`
    : `.pin.left[data-pin="${CSS.escape(pinName)}"] .jack, .pin.left .jack`;
  const jack = node.querySelector(sel);
  if (!jack || !els.editor) return null;
  const er = els.editor.getBoundingClientRect();
  const jr = jack.getBoundingClientRect();
  return { x: jr.left - er.left + jr.width / 2, y: jr.top - er.top + jr.height / 2 };
}

export function bezierPath(x1, y1, x2, y2) {
  const dx = Math.max(24, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx, c2x = x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

export function drawWires() {
  if (!els.wiresSvg) return;
  els.wiresSvg.replaceChildren();

  for (const e of state.edges.values()) {
    const a = getPinCenter(e.from.nid, 'right', e.from.pin);
    const b = getPinCenter(e.to.nid, 'left', e.to.pin);
    if (!a || !b) continue;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', `wire${e.kind === 'data' ? ' data' : ''}`);
    if (e.kind === 'data') {
      const key = colorKeyFor(e.type || 'any');
      const stroke = TYPE_COLORS[key] || '#64748b';
      path.style.setProperty('--wire', stroke);
      path.setAttribute('stroke', stroke);
    }
    path.setAttribute('d', bezierPath(a.x, a.y, b.x, b.y));
    els.wiresSvg.appendChild(path);
  }
}
