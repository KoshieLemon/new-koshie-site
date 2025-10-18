// interactions.marquee.js
// Marquee selection lifecycle.

import { els } from '../core/dom.js';
import { state } from '../core/state.js';
import { unprojectClient } from './interactions.view.js';
import { ix } from './interactions.ctx.js';
import { renderAll } from '../render/render.editor.js';

export function ensureMarqueeEl(){
  if (ix.marquee?.el) return;
  const el = document.createElement('div');
  el.id = 'bp-marquee';
  Object.assign(el.style, {
    position:'absolute', left:'0', top:'0', width:'0', height:'0',
    border:'1px solid #60a5fa', background:'rgba(59,130,246,0.1)',
    pointerEvents:'none', zIndex: 9999
  });
  els.editor.appendChild(el);
  ix.marquee = { el, active:false, add:false, startClient:{x:0,y:0}, startWorld:{x:0,y:0} };
}

export function startMarquee(ev){
  ensureMarqueeEl();
  ix.marquee.active = true;
  ix.marquee.add = ev.shiftKey || ev.ctrlKey || ev.metaKey;
  ix.marquee.startClient = { x: ev.clientX, y: ev.clientY };
  ix.marquee.startWorld  = unprojectClient(ev.clientX, ev.clientY);
  ix.marquee.el.style.display = 'block';
  const er = els.editor.getBoundingClientRect();
  ix.marquee.el.style.left = `${ev.clientX - er.left}px`;
  ix.marquee.el.style.top  = `${ev.clientY - er.top}px`;
  ix.marquee.el.style.width = '0px';
  ix.marquee.el.style.height= '0px';
}

export function updateMarquee(ev){
  if (!ix.marquee?.active) return;
  const er = els.editor.getBoundingClientRect();
  const x0 = ix.marquee.startClient.x - er.left;
  const y0 = ix.marquee.startClient.y - er.top;
  const x1 = ev.clientX - er.left;
  const y1 = ev.clientY - er.top;
  const left = Math.min(x0, x1), top = Math.min(y0, y1);
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  ix.marquee.el.style.left = `${left}px`;
  ix.marquee.el.style.top  = `${top}px`;
  ix.marquee.el.style.width = `${w}px`;
  ix.marquee.el.style.height= `${h}px`;
}

export function finishMarquee(ev){
  if (!ix.marquee?.active) return;
  const a = unprojectClient(ix.marquee.startClient.x, ix.marquee.startClient.y);
  const b = unprojectClient(ev.clientX, ev.clientY);
  const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);

  const inRect = new Set();
  for (const n of state.nodes.values()){
    const nx1 = n.x, ny1 = n.y, nx2 = n.x + ix.NODE_W, ny2 = n.y + ix.NODE_H;
    const overlap = !(nx2 < x1 || nx1 > x2 || ny2 < y1 || ny1 > y2);
    if (overlap) inRect.add(n.id);
  }

  if (ix.marquee.add){
    for (const id of inRect) state.sel.add(id);
  } else {
    state.sel = inRect;
  }

  ix.marquee.el.style.display = 'none';
  ix.marquee.active = false;
  renderAll();
}
