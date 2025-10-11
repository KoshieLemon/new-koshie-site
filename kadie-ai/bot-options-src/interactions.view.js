// Viewport, background, and view helpers used by interactions.js
import { els } from './dom.js';
import { state } from './state.js';
import { drawWires } from './render.js';

if (!state.view) state.view = { x: 0, y: 0, z: 1 };

const GRID = { minor: 32, major: 128 }; // world units

function mod(a, b){ return ((a % b) + b) % b; }

export function updateBackground(){
  if (!els.bg) return;
  const { x, y, z } = state.view;
  const sMin = Math.max(1, GRID.minor * z);
  const sMaj = Math.max(1, GRID.major * z);

  const minorH = `repeating-linear-gradient(0deg, #111827 0, #111827 1px, transparent 1px, transparent ${sMin}px)`;
  const minorV = `repeating-linear-gradient(90deg, #111827 0, #111827 1px, transparent 1px, transparent ${sMin}px)`;
  const majorH = `repeating-linear-gradient(0deg, #0f172a 0, #0f172a 1px, transparent 1px, transparent ${sMaj}px)`;
  const majorV = `repeating-linear-gradient(90deg, #0f172a 0, #0f172a 1px, transparent 1px, transparent ${sMaj}px)`;

  els.bg.style.backgroundImage = `${minorH}, ${minorV}, ${majorH}, ${majorV}`;

  const oxMin = mod(x, sMin);
  const oyMin = mod(y, sMin);
  const oxMaj = mod(x, sMaj);
  const oyMaj = mod(y, sMaj);
  els.bg.style.backgroundPosition =
    `${oxMin}px ${oyMin}px, ${oxMin}px ${oyMin}px, ${oxMaj}px ${oyMaj}px, ${oxMaj}px ${oyMaj}px`;
}

export function ensureBackground(){
  if (els.bg) return;
  const bg = document.createElement('div');
  bg.id = 'graph-bg';
  Object.assign(bg.style, {
    position: 'absolute',
    inset: '0',
    zIndex: 0,
    backgroundColor: '#0b1020',
    pointerEvents: 'none',
  });
  els.editor.appendChild(bg);
  els.bg = bg;
  updateBackground();
}

export function ensureViewport(){
  if (els.viewport) return;
  ensureBackground();

  const vp = document.createElement('div');
  vp.id = 'viewport';
  Object.assign(vp.style, {
    position: 'absolute',
    inset: '0',
    transformOrigin: '0 0',
    willChange: 'transform',
    zIndex: 1,
  });

  if (els.nodesLayer?.parentElement) els.nodesLayer.parentElement.insertBefore(vp, els.nodesLayer);
  vp.appendChild(els.nodesLayer);
  els.viewport = vp;

  // Keep wires in screen space above viewport
  Object.assign(els.wiresSvg.style, {
    position: 'absolute',
    inset: '0',
    zIndex: 2,
    pointerEvents: 'none',
  });
  if (!els.wiresSvg.parentElement || els.wiresSvg.parentElement !== els.editor){
    els.editor.appendChild(els.wiresSvg);
  }

  // Re-center button
  const btn = document.createElement('button');
  btn.id = 'recenter';
  btn.textContent = 'Re-center';
  Object.assign(btn.style, {
    position: 'absolute',
    right: '12px',
    bottom: '12px',
    zIndex: 10000,
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid #1f2937',
    background: '#0b1020',
    color: '#e5e7eb',
    cursor: 'pointer',
  });
  els.editor.appendChild(btn);
  els.recenter = btn;
}

export function applyView(){
  const { x, y, z } = state.view;
  els.viewport.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  updateBackground();
  drawWires(); // screen-space recompute
}

export function unprojectClient(clientX, clientY){
  const er = els.editor.getBoundingClientRect();
  const sx = clientX - er.left, sy = clientY - er.top;
  const { x, y, z } = state.view;
  return { x: (sx - x)/z, y: (sy - y)/z };
}

export function positionCtxMenuAt(clientX, clientY){
  const er = els.editor.getBoundingClientRect();
  const x = clientX - er.left;
  const y = clientY - er.top;
  els.ctxMenu.style.position = 'absolute';
  els.ctxMenu.style.left = `${x}px`;
  els.ctxMenu.style.top  = `${y}px`;
  els.ctxMenu.style.display = 'block';
  requestAnimationFrame(()=>{
    const mw = els.ctxMenu.offsetWidth  || 0;
    const mh = els.ctxMenu.offsetHeight || 0;
    let lx = x, ly = y;
    if (lx + mw > er.width)  lx = Math.max(0, er.width  - mw - 8);
    if (ly + mh > er.height) ly = Math.max(0, er.height - mh - 8);
    els.ctxMenu.style.left = `${lx}px`;
    els.ctxMenu.style.top  = `${ly}px`;
  });
}

export function recenter(nodeW, nodeH){
  let first = true;
  let minX=0, minY=0, maxX=0, maxY=0;
  for (const n of state.nodes.values()){
    const x1 = n.x, y1 = n.y;
    const x2 = n.x + nodeW, y2 = n.y + nodeH;
    if (first){ minX=x1; minY=y1; maxX=x2; maxY=y2; first=false; }
    else {
      if (x1<minX) minX=x1; if (y1<minY) minY=y1;
      if (x2>maxX) maxX=x2; if (y2>maxY) maxY=y2;
    }
  }
  const er = els.editor.getBoundingClientRect();
  if (first){
    state.view.x = er.width/2;
    state.view.y = er.height/2;
  } else {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    state.view.x = er.width/2  - cx * state.view.z;
    state.view.y = er.height/2 - cy * state.view.z;
  }
  applyView();
}
