// interactions.hint.js
// Wire hint tooltip and wire-cancel helpers.

import { ix } from './interactions.ctx.js';
import { drawWires } from '../render/render.wires.js';

export function ensureWireHint(){
  if (ix.wireHint) return;
  const div = document.createElement('div');
  div.id = 'wire-hint';
  Object.assign(div.style, {
    position:'fixed', left:'-9999px', top:'-9999px',
    padding:'2px 6px', borderRadius:'6px',
    border:'1px solid #1f2937', background:'#0b1020',
    color:'#e5e7eb', font:'600 11px/1 system-ui,Segoe UI,Roboto,Arial,sans-serif',
    pointerEvents:'none', zIndex: 10000, opacity:.95
  });
  document.body.appendChild(div);
  ix.wireHint = div;
}

export function showHint(label, clientX, clientY){
  ensureWireHint();
  if (!label){ hideHint(); return; }
  ix.wireHint.textContent = label;
  ix.wireHint.style.left = `${clientX + 12}px`;
  ix.wireHint.style.top  = `${clientY - 18}px`;
}

export function hideHint(){
  if (ix.wireHint){
    ix.wireHint.style.left='-9999px';
    ix.wireHint.style.top='-9999px';
  }
}

export function cancelDragWire(redraw=false){
  if (ix.dragWire?.tempPath){ ix.dragWire.tempPath.remove(); ix.dragWire.tempPath = null; }
  ix.dragWire = null;
  hideHint();
  if (redraw) drawWires();
}

export function clearLockedWire(){
  if (ix.lockedWire?.tempPath){ ix.lockedWire.tempPath.remove(); }
  ix.lockedWire = null;
  hideHint();
}
