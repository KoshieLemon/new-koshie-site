// core/state.js — shared editor state + history + uid
export const state = {
  gid: null,
  bpId: null,
  bpName: null,

  // Graph
  nodes: new Map(),            // Map<id, { id, defId, x, y, params? }>
  edges: new Map(),            // Map<id, { id, kind:'exec'|'data', from:{nid,pin}, to:{nid,pin} }>

  // Selection and view
  sel: new Set(),              // Set<nodeId>
  view: { x: 0, y: 0, z: 1 },  // pan/zoom

  // Dirty flag + callback hook
  _dirtyEl: null,
  onDirty: null,

  // History
  _history: [],
  _future: [],
};

// ---- uid ----
let __ctr = 0;
export function uid(prefix = 'id') {
  __ctr = (__ctr + 1) >>> 0;
  return `${prefix}_${Date.now().toString(36)}_${(__ctr & 0xffff).toString(36)}`;
}

// ---- dirty flag helpers ----
export function markDirty(el) {
  if (el) state._dirtyEl = el;
  const t = state._dirtyEl || document.getElementById('dirty');
  if (t) t.classList.add('show');
  if (typeof state.onDirty === 'function') state.onDirty();
}

export function clearDirty(el) {
  if (el) state._dirtyEl = el;
  const t = state._dirtyEl || document.getElementById('dirty');
  if (t) t.classList.remove('show');
}

// ---- snapshot helpers ----
function cloneNodesMap(m) {
  const out = new Map();
  for (const [k, v] of m.entries()) {
    out.set(k, { ...v, params: v.params ? JSON.parse(JSON.stringify(v.params)) : undefined });
  }
  return out;
}
function cloneEdgesMap(m) {
  const out = new Map();
  for (const [k, v] of m.entries()) out.set(k, JSON.parse(JSON.stringify(v)));
  return out;
}

// returns a JSON string (site code expects JSON.parse(snapshot()))
export function snapshot() {
  return JSON.stringify({
    nodes: [...state.nodes.values()],
    edges: [...state.edges.values()],
  });
}

export function loadSnapshot(data, afterRender) {
  const obj = typeof data === 'string' ? JSON.parse(data) : (data || {});
  const nodesArr = Array.isArray(obj.nodes) ? obj.nodes : [];
  const edgesArr = Array.isArray(obj.edges) ? obj.edges : [];

  // Replace maps atomically so consumers see a consistent graph
  state.nodes = new Map(nodesArr.map(n => [String(n.id), { ...n }]));
  state.edges = new Map(edgesArr.map(e => [String(e.id), { ...e }]));
  state.sel.clear();

  // Debug: counts and a sample
  console.info('[BP DEBUG] loadSnapshot:',
    `nodes=${state.nodes.size}`,
    `edges=${state.edges.size}`,
    state.nodes.size ? `firstNode=${[...state.nodes.keys()][0]}` : 'firstNode=none'
  );

  clearHistory();
  pushHistory();
  if (typeof afterRender === 'function') afterRender();
  clearDirty();
}

// ---- history API ----
export function pushHistory() {
  state._history.push({
    gid: state.gid,
    bpId: state.bpId,
    bpName: state.bpName,
    nodes: cloneNodesMap(state.nodes),
    edges: cloneEdgesMap(state.edges),
  });
  state._future.length = 0;
  markDirty();
}

export function clearHistory() {
  state._history.length = 0;
  state._future.length = 0;
  state._history.push({
    gid: state.gid,
    bpId: state.bpId,
    bpName: state.bpName,
    nodes: cloneNodesMap(state.nodes),
    edges: cloneEdgesMap(state.edges),
  });
  clearDirty();
}

export function undo(afterRender) {
  if (state._history.length <= 1) return;
  const cur = state._history.pop();
  state._future.push(cur);
  const prev = state._history[state._history.length - 1];

  state.gid = prev.gid;
  state.bpId = prev.bpId;
  state.bpName = prev.bpName;
  state.nodes = cloneNodesMap(prev.nodes);
  state.edges = cloneEdgesMap(prev.edges);

  if (afterRender) afterRender();
  markDirty();
}

export function redo(afterRender) {
  if (state._future.length === 0) return;
  const next = state._future.pop();
  state._history.push(next);

  state.gid = next.gid;
  state.bpId = next.bpId;
  state.bpName = next.bpName;
  state.nodes = cloneNodesMap(next.nodes);
  state.edges = cloneEdgesMap(next.edges);

  if (afterRender) afterRender();
  markDirty();
}
