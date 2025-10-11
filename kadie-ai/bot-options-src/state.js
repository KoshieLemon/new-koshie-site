export const state = {
  nodes: new Map(),
  edges: new Map(),
  sel: new Set(),
  seq: 1,
  history: [],
  future: [],
  dirty: false,
  currentBlueprint: null,
  nodesIndex: { nodes: [] }
};

export function uid(prefix){
  return `${prefix}_${Date.now().toString(36)}_${(state.seq++)}`;
}

export function snapshot(){
  return JSON.stringify({ nodes:[...state.nodes.values()], edges:[...state.edges.values()] });
}

export function loadSnapshot(json, renderAll){
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  state.nodes.clear(); state.edges.clear();
  for (const n of (obj.nodes||[])) state.nodes.set(n.id, n);
  for (const e of (obj.edges||[])) state.edges.set(e.id, e);
  renderAll();
}

export function pushHistory(){
  state.history.push(snapshot());
  state.future.length = 0;
}

export function undo(renderAll){
  const cur = snapshot();
  const prev = state.history.pop();
  if (!prev) return;
  state.future.push(cur);
  loadSnapshot(prev, renderAll);
}

export function redo(renderAll){
  const next = state.future.pop();
  if (!next) return;
  state.history.push(snapshot());
  loadSnapshot(next, renderAll);
}

export function markDirty(dirtyEl){
  state.dirty = true;
  dirtyEl?.classList.add('show');
}

export function clearDirty(dirtyEl){
  state.dirty = false;
  dirtyEl?.classList.remove('show');
}

// ---- blueprint param helpers ----
export function ensureParams(node){
  if (!node.params) node.params = {};
  return node.params;
}

export function setParam(nid, name, value){
  const n = state.nodes.get(nid);
  if (!n) return;
  ensureParams(n)[name] = value;
}

export function getParam(nid, name){
  const n = state.nodes.get(nid);
  if (!n) return undefined;
  return ensureParams(n)[name];
}

export function hasIncomingEdge(nid, pin){
  for (const e of state.edges.values()){
    if (e.to?.nid === nid && e.to?.pin === pin) return true;
  }
  return false;
}
