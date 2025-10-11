import { els } from './dom.js';
import { state, uid, pushHistory, markDirty, undo, redo } from './state.js';
import { renderAll, drawWires, bezierPath, getPinCenter, registerNodeInteractions } from './render.js';
import { openContextMenu } from './menu.js';

let drag = null;
let dragWire = null;
let selectionBox = null;

function enableNodeInteractions(el, model){
  // drag node
  el.addEventListener('mousedown', (ev)=>{
    if (ev.button!==0) return;
    if (!ev.shiftKey && !state.sel.has(model.id)) { state.sel.clear(); state.sel.add(model.id); renderAll(); }
    const start = { x: ev.clientX, y: ev.clientY };
    const startPos = [...state.sel].map(id => ({ id, x: state.nodes.get(id).x, y: state.nodes.get(id).y }));
    drag = { start, startPos };
    ev.preventDefault();
  });

  // node context menu
  el.addEventListener('contextmenu', (ev)=>{
    ev.preventDefault();
    const x = ev.clientX, y = ev.clientY;
    els.ctxMenu.innerHTML = '';
    els.ctxMenu.style.left = x+'px'; els.ctxMenu.style.top = y+'px'; els.ctxMenu.style.display='block';
    const mk = (label,fn)=>{ const d=document.createElement('div'); d.className='menu-item'; d.textContent=label; d.addEventListener('click',()=>{ fn(); els.ctxMenu.style.display='none';}); return d; };
    els.ctxMenu.appendChild(mk('Duplicate', ()=>{
      const n = structuredClone(state.nodes.get(model.id));
      n.id = uid('N'); n.x += 24; n.y += 24;
      state.nodes.set(n.id, n); state.sel.clear(); state.sel.add(n.id);
      renderAll(); pushHistory(); markDirty(els.dirty);
    }));
    els.ctxMenu.appendChild(mk('Delete', ()=>{
      state.nodes.delete(model.id);
      for (const [id,e] of [...state.edges]) if (e.from.nid===model.id || e.to.nid===model.id) state.edges.delete(id);
      renderAll(); pushHistory(); markDirty(els.dirty);
    }));
    window.addEventListener('click',()=>{ els.ctxMenu.style.display='none'; }, { once:true });
  });

  // pin connections
  el.querySelectorAll('.pin .jack').forEach(j=>{
    j.addEventListener('mousedown', (ev)=>{
      ev.stopPropagation();
      const pinEl = ev.currentTarget.closest('.pin');
      const side = pinEl.classList.contains('right') ? 'right' : 'left';
      const kind = pinEl.classList.contains('exec') ? 'exec' : 'data';
      dragWire = { from:{ nid:model.id, pin: pinEl.dataset.pin }, side, kind, tempPath:null };
      ev.preventDefault();
    });
  });
}

function addNodeAt(defId, x, y){
  const n = { id: uid('N'), defId, x: Math.round(x), y: Math.round(y) };
  state.nodes.set(n.id, n);
  state.sel.clear(); state.sel.add(n.id);
  renderAll(); pushHistory(); markDirty(els.dirty);
}

export function initInteractions(){
  registerNodeInteractions(enableNodeInteractions);

  els.editor.addEventListener('mousemove',(ev)=>{
    if (drag){
      const dx = ev.clientX - drag.start.x;
      const dy = ev.clientY - drag.start.y;
      for (const s of drag.startPos){
        const n = state.nodes.get(s.id);
        n.x = Math.round(s.x + dx);
        n.y = Math.round(s.y + dy);
      }
      renderAll(); markDirty(els.dirty);
    } else if (dragWire){
      const from = getPinCenter(dragWire.from.nid, dragWire.from.pin, 'right');
      const er = els.editor.getBoundingClientRect();
      const to = { x: ev.clientX - er.left, y: ev.clientY - er.top };
      if (dragWire.tempPath) dragWire.tempPath.remove();
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('class', `wire ${dragWire.kind==='data'?'data':''}`);
      p.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));
      els.wiresSvg.appendChild(p);
      dragWire.tempPath = p;
    } else if (selectionBox){
      const x = Math.min(selectionBox.start.x, ev.clientX);
      const y = Math.min(selectionBox.start.y, ev.clientY);
      const w = Math.abs(ev.clientX - selectionBox.start.x);
      const h = Math.abs(ev.clientY - selectionBox.start.y);
      const er = els.editor.getBoundingClientRect();
      if (els.rubber){
        els.rubber.style.display='block';
        els.rubber.style.left = (x - er.left) + 'px';
        els.rubber.style.top  = (y - er.top) + 'px';
        els.rubber.style.width = w + 'px';
        els.rubber.style.height = h + 'px';
      }
      state.sel.clear();
      const rx = x - er.left, ry = y - er.top;
      for (const n of state.nodes.values()){
        const nx = n.x, ny = n.y, nw = 200, nh = 92;
        const inter = !(nx>rx+w || nx+nw<rx || ny>ry+h || ny+nh<ry);
        if (inter) state.sel.add(n.id);
      }
      renderAll();
    }
  });

  window.addEventListener('mouseup',()=>{
    if (drag){ drag=null; pushHistory(); }
    if (dragWire){
      if (dragWire.tempPath){ dragWire.tempPath.remove(); dragWire.tempPath=null; }
      dragWire=null;
    }
    if (selectionBox){
      selectionBox=null;
      if (els.rubber) els.rubber.style.display='none';
    }
  });

  els.editor.addEventListener('mousedown',(ev)=>{
    if (ev.button===0 && ev.target===els.editor){
      selectionBox = { start:{ x:ev.clientX, y:ev.clientY } };
      state.sel.clear(); renderAll();
    }
  });

  els.editor.addEventListener('contextmenu', async (ev)=>{
    ev.preventDefault();
    const er = els.editor.getBoundingClientRect();
    await openContextMenu(ev.clientX, ev.clientY, (defId)=>{
      addNodeAt(defId, ev.clientX - er.left - 90, ev.clientY - er.top - 20);
    });
  });

  els.editor.addEventListener('dragover', (e)=>{ e.preventDefault(); });
  els.editor.addEventListener('drop', (e)=>{
    e.preventDefault();
    const defId = e.dataTransfer.getData('text/x-node-id');
    if (!defId) return;
    const er = els.editor.getBoundingClientRect();
    addNodeAt(defId, e.clientX - er.left - 90, e.clientY - er.top - 20);
  });

  els.editor.addEventListener('mouseup',(ev)=>{
    if (!dragWire) return;
    const pinEl = ev.target.closest?.('.pin.left, .pin.right');
    if (!pinEl) return;
    const toNodeEl = ev.target.closest('.node');
    if (!toNodeEl) return;
    const toNid = toNodeEl.dataset.nid;
    const toSide = pinEl.classList.contains('right') ? 'right' : 'left';
    const toPin = pinEl.dataset.pin;
    const from = dragWire.from;
    const kind = dragWire.kind;
    if (toSide==='right'){ dragWire=null; return; } // connect into left pins only
    const edge = { id: uid('E'), from, to:{ nid: toNid, pin: toPin }, kind };
    state.edges.set(edge.id, edge);
    drawWires(); pushHistory(); markDirty(els.dirty);
    if (dragWire?.tempPath){ dragWire.tempPath.remove(); }
    dragWire=null;
  });

  window.addEventListener('keydown',(e)=>{
    const z = e.key.toLowerCase()==='z';
    const y = e.key.toLowerCase()==='y';
    if ((e.ctrlKey||e.metaKey) && z){ e.preventDefault(); undo(renderAll); }
    if ((e.ctrlKey||e.metaKey) && y){ e.preventDefault(); redo(renderAll); }
    if (e.key==='Delete'){
      for (const id of [...state.sel]) state.nodes.delete(id);
      renderAll(); pushHistory(); markDirty(els.dirty);
    }
  });
}
