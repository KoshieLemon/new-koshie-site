// /kadie-ai/blueprints-editor-src/interactions/interactions.view.js
// Viewport, background, and view helpers used by interactions.js
import { els } from '../core/dom.js';
import { state } from '../core/state.js';
import { drawWires } from '../render/render.js';

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

/* Position the small node context menu (Duplicate/Delete) at the cursor.
   Use document.body + position:fixed so it matches the main palette behavior. */
export function positionCtxMenuAt(clientX, clientY){
  if (els.ctxMenu.parentElement !== document.body) document.body.appendChild(els.ctxMenu);
  const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  els.ctxMenu.style.position = 'fixed';
  els.ctxMenu.style.left = `${clientX}px`;
  els.ctxMenu.style.top  = `${clientY}px`;
  els.ctxMenu.style.display = 'block';
  requestAnimationFrame(()=>{
    const mw = els.ctxMenu.offsetWidth  || 0;
    const mh = els.ctxMenu.offsetHeight || 0;
    let lx = clientX, ly = clientY;
    if (lx + mw > vw) lx = Math.max(0, vw - mw - 8);
    if (ly + mh > vh) ly = Math.max(0, vh - mh - 8);
    els.ctxMenu.style.left = `${lx}px`;
    els.ctxMenu.style.top  = `${ly}px`;
  });
}