// bot-options-src/blueprints.js — load/save list + active blueprint

import { els } from './dom.js';
import { state, pushHistory, clearHistory, markDirty } from './state.js';
import { renderAll } from './render.js';
import {
  listBlueprints,
  openBlueprint,
  saveBlueprint,
  createBlueprint,
  renameBlueprint,
  deleteBlueprint,
} from './providers.js';

// ---------- helpers ----------
function mapFromArray(arr, key = 'id') {
  const m = new Map();
  for (const it of arr || []) m.set(it[key], it);
  return m;
}
function arrayFromMap(m) {
  return Array.from(m.values());
}
function serializeLayout() {
  const layout = {};
  for (const n of state.nodes.values()) layout[n.id] = { x: n.x, y: n.y };
  return layout;
}
function applyLayout(layout = {}) {
  for (const [nid, pos] of Object.entries(layout)) {
    const n = state.nodes.get(nid);
    if (n) { n.x = pos.x ?? n.x; n.y = pos.y ?? n.y; }
  }
}
function setDirty(on) {
  els.dirty?.classList.toggle('show', !!on);
}

// ---------- UI wiring ----------
function bindToolbar(gid) {
  const sel = document.getElementById('bpSelect');
  const btnCreate = document.getElementById('bpCreate');
  const btnRename = document.getElementById('bpRename');
  const btnDelete = document.getElementById('bpDelete');

  sel?.addEventListener('change', async () => {
    const id = sel.value;
    if (!id) return;
    await openById(gid, id);
  });

  btnCreate?.addEventListener('click', async () => {
    const name = prompt('New blueprint name?')?.trim();
    if (!name) return;
    const bp = await createBlueprint(gid, { name });
    await refreshList(gid, bp.id);
  });

  btnRename?.addEventListener('click', async () => {
    if (!state.bpId) return;
    const name = prompt('Rename blueprint to?', state.bpName)?.trim();
    if (!name) return;
    await renameBlueprint(gid, { id: state.bpId, name });
    await refreshList(gid, state.bpId);
  });

  btnDelete?.addEventListener('click', async () => {
    if (!state.bpId) return;
    if (!confirm('Delete this blueprint?')) return;
    await deleteBlueprint(gid, { id: state.bpId });
    state.bpId = null;
    state.bpName = null;
    state.nodes.clear();
    state.edges.clear();
    els.disabledOverlay.style.display = '';
    await refreshList(gid, '');
    renderAll();
    clearHistory();
    setDirty(false);
  });
}

async function refreshList(gid, selectId = '') {
  const list = await listBlueprints(gid); // [{id,name}]
  const sel = document.getElementById('bpSelect');
  sel.innerHTML = '';
  for (const bp of list) {
    const o = document.createElement('option');
    o.value = bp.id;
    o.textContent = bp.name;
    sel.appendChild(o);
  }
  if (list.length === 0) {
    els.disabledOverlay.style.display = '';
    return;
  }
  const id = selectId || state.bpId || list[0].id;
  sel.value = id;
  await openById(gid, id);
}

async function openById(gid, id) {
  const payload = await openBlueprint(gid, { id });
  // payload: { id, name, nodes:[{id,defId,x,y,params}], edges:[{id,from:{nid,pin},to:{nid,pin},kind}], layout? }
  state.bpId = payload.id;
  state.bpName = payload.name;

  state.nodes = mapFromArray(payload.nodes || []);
  state.edges = mapFromArray(payload.edges || []);

  // optional layout section
  applyLayout(payload.layout);

  els.disabledOverlay.style.display = 'none';
  renderAll();
  clearHistory();
  setDirty(false);
}

export async function saveCurrentBlueprint() {
  if (!state.bpId) return;

  const doc = {
    id: state.bpId,
    name: state.bpName,
    nodes: arrayFromMap(state.nodes),
    edges: arrayFromMap(state.edges),
    layout: serializeLayout(), // visual-only
    // execution data are inside nodes/edges; renderer ignores layout
  };

  await saveBlueprint(state.gid, doc);
  setDirty(false);
}

export async function revertCurrentBlueprint() {
  if (!state.bpId) return;
  await openById(state.gid, state.bpId);
}

// ---------- entry ----------
export async function initBlueprints(gid) {
  state.gid = gid;

  // mark dirty on any subsequent edits via state.markDirty
  state.onDirty = () => setDirty(true);

  bindToolbar(gid);
  await refreshList(gid);
  pushHistory(); // initial
  markDirty(els.dirty); // ensure handler attached
}
