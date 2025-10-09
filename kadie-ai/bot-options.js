// /kadie-ai/bot-options.js
// Guild header stays; we add a blueprint editor below.
import { fetchGuildCounts, printDiagnostics } from '/assets/api.js';
printDiagnostics('bot-options.html');

function qp(name){ return new URLSearchParams(location.search).get(name) || ''; }
const gid   = qp('guild_id');
const gname = decodeURIComponent(qp('guild_name'));
const gicon = qp('guild_icon');
const totalQ = qp('total');
const onlineQ = qp('online');

// ---- header
const nameEl = document.getElementById('gname');
const metaEl = document.getElementById('gmeta');
const iconEl = document.getElementById('gicon');
nameEl.textContent = gname || '(unnamed)';
if (gicon) {
  iconEl.src = `https://cdn.discordapp.com/icons/${gid}/${gicon}.png?size=128`;
  iconEl.alt = gname || 'icon';
} else {
  iconEl.removeAttribute('src');
}
const total = Number(qp('total')) || null;
const online = Number(qp('online')) || null;
const parts = [`ID: ${gid || '(unknown)'}`];
if (typeof online === 'number' && !Number.isNaN(online)) parts.push(`${online} online`);
if (typeof total === 'number' && !Number.isNaN(total)) parts.push(`${total} members`);
metaEl.textContent = parts.join(' • ');

// ===== CONFIG =====
const BOT_BASE = new URLSearchParams(location.search).get('bot') || 'https://kadie-ai-production.up.railway.app'; // change if needed
const USE_FIREBASE_CLIENT = !!window.firebaseConfig; // optional if you embed Firebase client config on the page

// ===== PROVIDERS =====
class BotApiProvider {
  async listBlueprints(guildId){
    const r = await fetch(`${BOT_BASE}/blueprints?guild_id=${encodeURIComponent(guildId)}`).catch(()=>null);
    if (!r || !r.ok) return null;
    return await r.json(); // [{id,name,data}]
  }
  async saveBlueprint(guildId, bp){
    const r = await fetch(`${BOT_BASE}/blueprints?guild_id=${encodeURIComponent(guildId)}`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bp)
    }).catch(()=>null);
    return !!(r && r.ok);
  }
  async deleteBlueprint(guildId, id){
    const r = await fetch(`${BOT_BASE}/blueprints/${encodeURIComponent(id)}?guild_id=${encodeURIComponent(guildId)}`,{method:'DELETE'}).catch(()=>null);
    return !!(r && r.ok);
  }
}

class LocalProvider {
  key(g){ return `blueprints:${g}`; }
  async listBlueprints(g){
    const raw = localStorage.getItem(this.key(g));
    const arr = raw ? JSON.parse(raw) : [];
    return arr;
  }
  async saveBlueprint(g, bp){
    const arr = (await this.listBlueprints(g)) || [];
    const i = arr.findIndex(x=>x.id===bp.id);
    if (i>=0) arr[i]=bp; else arr.push(bp);
    localStorage.setItem(this.key(g), JSON.stringify(arr));
    return true;
  }
  async deleteBlueprint(g,id){
    const arr = (await this.listBlueprints(g)) || [];
    const out = arr.filter(x=>x.id!==id);
    localStorage.setItem(this.key(g), JSON.stringify(out));
    return true;
  }
}

class FirestoreProvider {
  constructor(){
    // Optional browser client SDK; expects window.firebaseApp + window.firestore already initialized securely.
    this.db = window.firestore;
  }
  col(g){ return this.db.collection('guilds').doc(g).collection('blueprints'); }
  async listBlueprints(g){
    const snap = await this.col(g).get();
    return snap.docs.map(d=>({ id:d.id, name:d.data().name || d.id, data:d.data().data || {} }));
  }
  async saveBlueprint(g,bp){
    await this.col(g).doc(bp.id).set({ name: bp.name, data: bp.data }, { merge:true });
    return true;
  }
  async deleteBlueprint(g,id){
    await this.col(g).doc(id).delete();
    return true;
  }
}

// Choose provider: Bot API, else Firestore client, else Local.
const Provider = new BotApiProvider();
const Fallback = USE_FIREBASE_CLIENT ? new FirestoreProvider() : new LocalProvider();

async function listBlueprintsSafe(g){
  const a = await Provider.listBlueprints(g);
  if (Array.isArray(a)) return a;
  return await Fallback.listBlueprints(g);
}
async function saveBlueprintSafe(g,bp){
  const ok = await Provider.saveBlueprint(g,bp);
  if (ok) return true;
  return await Fallback.saveBlueprint(g,bp);
}
async function deleteBlueprintSafe(g,id){
  const ok = await Provider.deleteBlueprint(g,id);
  if (ok) return true;
  return await Fallback.deleteBlueprint(g,id);
}

// ===== NODES INDEX =====
async function fetchNodesIndex(){
  const r = await fetch(`${BOT_BASE}/nodes-index`).catch(()=>null);
  if (!r || !r.ok) return { nodes: [] };
  return await r.json();
}

function groupNodesByCategory(nodes){
  // Use id like "actions.messages.sendMessage" => ["actions","messages","sendMessage"]
  const tree = {};
  for (const n of nodes) {
    const parts = String(n.id).split('.');
    let cur = tree;
    for (let i=0;i<parts.length;i++){
      const p = parts[i];
      if (!cur[p]) cur[p] = (i === parts.length-1 ? { __leaf: n } : {});
      cur = cur[p];
    }
  }
  return tree;
}

// ===== GRAPH MODEL =====
const state = {
  nodes: new Map(),    // id -> {id, defId, x, y, inputs:{}, outputs:{}}
  edges: new Map(),    // id -> {id, from:{nid,pin}, to:{nid,pin}, kind:"exec"|"data", type?:string}
  sel: new Set(),
  seq: 1,
  history: [],
  future: [],
  dirty: false,
  currentBlueprint: null,
  nodesIndex: { nodes: [] }
};

function uid(prefix){ return `${prefix}_${Date.now().toString(36)}_${(state.seq++)}`; }

function snapshot(){
  return JSON.stringify({
    nodes:[...state.nodes.values()],
    edges:[...state.edges.values()]
  });
}
function loadSnapshot(json){
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  state.nodes.clear(); state.edges.clear();
  for (const n of (obj.nodes||[])) state.nodes.set(n.id, n);
  for (const e of (obj.edges||[])) state.edges.set(e.id, e);
  renderAll();
}

function pushHistory(){
  state.history.push(snapshot());
  state.future.length = 0;
}
function markDirty(){
  state.dirty = true;
  document.getElementById('dirty').classList.add('show');
}
function clearDirty(){
  state.dirty = false;
  document.getElementById('dirty').classList.remove('show');
}

// ===== UI ELEMENTS =====
const bpSelect = document.getElementById('bpSelect');
const bpCreate = document.getElementById('bpCreate');
const bpRename = document.getElementById('bpRename');
const bpDelete = document.getElementById('bpDelete');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const saveBtn = document.getElementById('saveBtn');
const revertBtn = document.getElementById('revertBtn');

const editor = document.getElementById('editor');
const nodesLayer = document.getElementById('nodes');
const wiresSvg = document.getElementById('wires');
const overlayDisabled = document.getElementById('disabledOverlay');
const ctxMenu = document.getElementById('ctx');
const rubber = document.getElementById('rubber');

// wires SVG sizing
function fitSvg(){
  const r = editor.getBoundingClientRect();
  wiresSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
}
window.addEventListener('resize', fitSvg); fitSvg();

// ===== RENDERERS =====
function bezierPath(x1,y1,x2,y2){
  const dx = Math.max(60, Math.abs(x2-x1)*0.5);
  const c1x = x1 + dx, c1y = y1;
  const c2x = x2 - dx, c2y = y2;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}
function pinCenter(nid, pinName, side){
  const el = document.querySelector(`[data-nid="${nid}"] .pin.${side}[data-pin="${pinName}"] .jack`);
  if (!el) return null;
  const er = editor.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - er.left + r.width/2, y: r.top - er.top + r.height/2 };
}
function drawWires(){
  wiresSvg.innerHTML = '';
  for (const e of state.edges.values()){
    const from = pinCenter(e.from.nid, e.from.pin, 'right');
    const to   = pinCenter(e.to.nid,   e.to.pin,   'left');
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('class', `wire ${e.kind==='data'?'data':''}`);
    path.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));
    wiresSvg.appendChild(path);
  }
}
function renderNode(n){
  let el = document.querySelector(`.node[data-nid="${n.id}"]`);
  if (!el) {
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
    nodesLayer.appendChild(el);
    enableNodeInteractions(el, n);
  }
  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
  el.classList.toggle('selected', state.sel.has(n.id));
}
function renderAll(){
  nodesLayer.innerHTML = '';
  for (const n of state.nodes.values()) renderNode(n);
  drawWires();
}

// ===== INTERACTION =====
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
    openNodeContext(ev.clientX, ev.clientY, model.id);
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

editor.addEventListener('mousemove',(ev)=>{
  if (drag){
    const dx = ev.clientX - drag.start.x;
    const dy = ev.clientY - drag.start.y;
    for (const s of drag.startPos){
      const n = state.nodes.get(s.id);
      n.x = Math.round(s.x + dx);
      n.y = Math.round(s.y + dy);
    }
    renderAll(); markDirty();
  } else if (dragWire){
    // live wire preview
    const from = pinCenter(dragWire.from.nid, dragWire.from.pin, 'right');
    const er = editor.getBoundingClientRect();
    const to = { x: ev.clientX - er.left, y: ev.clientY - er.top };
    if (dragWire.tempPath) dragWire.tempPath.remove();
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('class', `wire ${dragWire.kind==='data'?'data':''}`);
    p.setAttribute('d', bezierPath(from.x, from.y, to.x, to.y));
    wiresSvg.appendChild(p);
    dragWire.tempPath = p;
  } else if (selectionBox){
    const x = Math.min(selectionBox.start.x, ev.clientX);
    const y = Math.min(selectionBox.start.y, ev.clientY);
    const w = Math.abs(ev.clientX - selectionBox.start.x);
    const h = Math.abs(ev.clientY - selectionBox.start.y);
    const er = editor.getBoundingClientRect();
    rubber.style.display='block';
    rubber.style.left = (x - er.left) + 'px';
    rubber.style.top  = (y - er.top) + 'px';
    rubber.style.width = w + 'px';
    rubber.style.height = h + 'px';
    // select nodes intersecting
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
    rubber.style.display='none';
  }
});

editor.addEventListener('mousedown',(ev)=>{
  if (ev.button===0 && ev.target===editor){
    selectionBox = { start:{ x:ev.clientX, y:ev.clientY } };
    state.sel.clear(); renderAll();
  }
});

editor.addEventListener('contextmenu', async (ev)=>{
  ev.preventDefault();
  await openContextMenu(ev.clientX, ev.clientY);
});

// drop from context menu
editor.addEventListener('dragover', (e)=>{ e.preventDefault(); });
editor.addEventListener('drop', (e)=>{
  e.preventDefault();
  const defId = e.dataTransfer.getData('text/x-node-id');
  if (!defId) return;
  const er = editor.getBoundingClientRect();
  const n = { id: uid('N'), defId, x: Math.round(e.clientX - er.left - 90), y: Math.round(e.clientY - er.top - 20) };
  state.nodes.set(n.id, n);
  state.sel.clear(); state.sel.add(n.id);
  renderAll(); pushHistory(); markDirty();
});

// wires connect on mouseup over a pin
editor.addEventListener('mouseup',(ev)=>{
  if (!dragWire) return;
  const pinEl = ev.target.closest?.('.pin.left, .pin.right');
  if (!pinEl) return;
  const toNodeEl = ev.target.closest('.node');
  if (!toNodeEl) return;
  const toNid = toNodeEl.dataset.nid;
  const toSide = pinEl.classList.contains('right') ? 'right' : 'left';
  const toPin = pinEl.dataset.pin;
  const from = dragWire.from;

  // enforce exec left<->right and same kind
  const kind = dragWire.kind;
  const okSides = (toSide !== 'right'); // connect to left pins
  if (!okSides){ dragWire=null; return; }

  const edge = { id: uid('E'), from, to:{ nid: toNid, pin: toPin }, kind };
  state.edges.set(edge.id, edge);
  renderAll(); pushHistory(); markDirty();
  dragWire=null;
});

// Node context menu
function openNodeContext(x,y,nid){
  ctxMenu.innerHTML = '';
  ctxMenu.style.left = x+'px'; ctxMenu.style.top = y+'px'; ctxMenu.style.display='block';
  const mk = (label,fn)=>{ const d=document.createElement('div'); d.className='menu-item'; d.textContent=label; d.addEventListener('click',()=>{ fn(); ctxMenu.style.display='none';}); return d; };
  ctxMenu.appendChild(mk('Duplicate', ()=>{
    const n = structuredClone(state.nodes.get(nid));
    n.id = uid('N'); n.x += 24; n.y += 24;
    state.nodes.set(n.id, n); state.sel.clear(); state.sel.add(n.id);
    renderAll(); pushHistory(); markDirty();
  }));
  ctxMenu.appendChild(mk('Delete', ()=>{
    state.nodes.delete(nid);
    // remove edges touching
    for (const [id,e] of [...state.edges]) if (e.from.nid===nid || e.to.nid===nid) state.edges.delete(id);
    renderAll(); pushHistory(); markDirty();
  }));
}
window.addEventListener('click',()=>{ ctxMenu.style.display='none'; });

// Global keyboard shortcuts
window.addEventListener('keydown',(e)=>{
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ doUndo(); }
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ doRedo(); }
  if (e.key==='Delete'){ for (const id of [...state.sel]) { state.nodes.delete(id); }; renderAll(); pushHistory(); markDirty(); }
});

// Undo/Redo
function doUndo(){
  const cur = snapshot();
  const prev = state.history.pop();
  if (!prev) return;
  state.future.push(cur);
  loadSnapshot(prev);
}
function doRedo(){
  const next = state.future.pop();
  if (!next) return;
  state.history.push(snapshot());
  loadSnapshot(next);
}
undoBtn.addEventListener('click',doUndo);
redoBtn.addEventListener('click',doRedo);

// Save/Revert
saveBtn.addEventListener('click', async ()=>{
  if (!state.currentBlueprint) return;
  const bp = { id: state.currentBlueprint.id, name: state.currentBlueprint.name, data: JSON.parse(snapshot()) };
  const ok = await saveBlueprintSafe(gid, bp);
  if (ok){ clearDirty(); }
});
revertBtn.addEventListener('click', async ()=>{
  if (!state.currentBlueprint) return;
  await openBlueprint(state.currentBlueprint.id);
  clearDirty();
});

// ===== BLUEPRINT MENU =====
async function refreshBlueprints(){
  const list = await listBlueprintsSafe(gid) || [];
  bpSelect.innerHTML = '';
  if (list.length===0){
    const opt = document.createElement('option'); opt.value=''; opt.textContent='(no blueprints)';
    bpSelect.appendChild(opt);
    overlayDisabled.style.display='flex';
  } else {
    for (const b of list){
      const opt = document.createElement('option'); opt.value=b.id; opt.textContent=b.name || b.id;
      bpSelect.appendChild(opt);
    }
    overlayDisabled.style.display='none';
  }
  return list;
}

async function openBlueprint(id){
  const list = await listBlueprintsSafe(gid) || [];
  const bp = list.find(x=>x.id===id);
  if (!bp){ overlayDisabled.style.display='flex'; return; }
  state.currentBlueprint = { id: bp.id, name: bp.name };
  loadSnapshot(bp.data || { nodes:[], edges:[] });
  clearDirty();
  // select in dropdown
  [...bpSelect.options].forEach(o=>{ if (o.value===id) o.selected=true; });
  overlayDisabled.style.display='none';
}

bpSelect.addEventListener('change', async ()=>{
  const id = bpSelect.value;
  if (!id){ overlayDisabled.style.display='flex'; return; }
  await openBlueprint(id);
});

bpCreate.addEventListener('click', async ()=>{
  const name = prompt('Name this blueprint:');
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || `bp-${Date.now()}`;
  const bp = { id, name, data:{ nodes:[], edges:[] } };
  await saveBlueprintSafe(gid, bp);
  await refreshBlueprints();
  await openBlueprint(id);
});
bpRename.addEventListener('click', async ()=>{
  if (!state.currentBlueprint) return;
  const name = prompt('New name:', state.currentBlueprint.name);
  if (!name) return;
  const bp = { id: state.currentBlueprint.id, name, data: JSON.parse(snapshot()) };
  await saveBlueprintSafe(gid, bp);
  await refreshBlueprints();
  await openBlueprint(bp.id);
});
bpDelete.addEventListener('click', async ()=>{
  if (!state.currentBlueprint) return;
  if (!confirm('Delete this blueprint?')) return;
  await deleteBlueprintSafe(gid, state.currentBlueprint.id);
  state.currentBlueprint = null;
  await refreshBlueprints();
  overlayDisabled.style.display='flex';
  nodesLayer.innerHTML=''; wiresSvg.innerHTML='';
  state.nodes.clear(); state.edges.clear(); state.sel.clear();
  clearDirty();
});

// ===== CONTEXT MENU FOR NODE CATALOG =====
async function openContextMenu(x,y){
  const idx = state.nodesIndex = await fetchNodesIndex();
  const tree = groupNodesByCategory(idx.nodes || []);
  ctxMenu.style.left = x+'px'; ctxMenu.style.top = y+'px';
  ctxMenu.innerHTML = '';
  buildTree(ctxMenu, tree, []);
  ctxMenu.style.display='block';
}
function buildTree(root, node, path){
  for (const [k,v] of Object.entries(node)){
    if (k==='__leaf') continue;
    if (v.__leaf){
      const item = document.createElement('div');
      item.className='menu-item';
      item.textContent = [...path, k].join('.');
      item.setAttribute('draggable','true');
      const defId = v.__leaf.id;
      item.addEventListener('dragstart',(e)=>{ e.dataTransfer.setData('text/x-node-id', defId); });
      item.addEventListener('click',()=>{
        // quick add at context menu position
        const rect = editor.getBoundingClientRect();
        const n = { id: uid('N'), defId, x: Math.round(rect.width/2-90), y: Math.round(rect.height/2-20) };
        state.nodes.set(n.id, n);
        state.sel.clear(); state.sel.add(n.id);
        renderAll(); pushHistory(); markDirty();
        ctxMenu.style.display='none';
      });
      root.appendChild(item);
    } else {
      const h = document.createElement('h4'); h.textContent = [...path, k].join('/');
      root.appendChild(h);
      const sub = document.createElement('div'); sub.className='submenu';
      root.appendChild(sub);
      buildTree(sub, v, [...path, k]);
    }
  }
}

// ===== INIT =====
(async function init(){
  await refreshBlueprints();
  if (bpSelect.options.length>0 && bpSelect.value){
    await openBlueprint(bpSelect.value);
  } else {
    overlayDisabled.style.display='flex';
  }
  renderAll();
})();
