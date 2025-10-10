// bot-options-src/state.js — shared editor state + history

// canonical in-memory graph state
export const state = {
  gid: null,
  bpId: null,
  bpName: null,

  // Maps for fast lookup
  nodes: new Map(), // { id, defId, x, y, params? }
  edges: new Map(), // { id, kind:'exec'|'data', from:{nid,pin}, to:{nid,pin} }

  // change tracking
  _dirtyEl: null,
  onDirty: null, // set by callers; call with () => {}

  // history
  _history: [],  // array of snapshots
  _future: [],   // redo stack
};

// ----- dirty indicator helpers -----
function setDirtyFlag(on) {
  if (state._dirtyEl) state._dirtyEl.classList.toggle('show', !!on);
  if (typeof state.onDirty === 'function' && on) state.onDirty();
}

export function markDirty(el) {
  state._dirtyEl = el || state._dirtyEl || null;
}

// ----- snapshot helpers -----
function cloneNodesMap(m) {
  const out = new Map();
  for (const [k, v] of m.entries()) {
    // shallow clone is enough for our node shape
    out.set(k, { ...v, params: v.params ? JSON.parse(JSON.stringify(v.params)) : undefined });
  }
  return out;
}

function cloneEdgesMap(m) {
  const out = new Map();
  for (const [k, v] of m.entries()) {
    out.set(k, JSON.parse(JSON.stringify(v)));
  }
  return out;
}

function snapshot() {
  return {
    gid: state.gid,
    bpId: state.bpId,
    bpName: state.bpName,
    nodes: cloneNodesMap(state.nodes),
    edges: cloneEdgesMap(state.edges),
  };
}

function applySnapshot(snap) {
  state.gid = snap.gid ?? state.gid;
  state.bpId = snap.bpId ?? null;
  state.bpName = snap.bpName ?? null;

  state.nodes = cloneNodesMap(snap.nodes || new Map());
  state.edges = cloneEdgesMap(snap.edges || new Map());
}

// ----- history API -----
export function pushHistory(_label = '') {
  // keep last snapshot identical check optional; simplest: always push
  state._history.push(snapshot());
  state._future.length = 0; // clear redo chain on new edits
  setDirtyFlag(true);
}

export function clearHistory() {
  state._history.length = 0;
  state._future.length = 0;
  // push a baseline so one undo is not possible immediately
  state._history.push(snapshot());
  setDirtyFlag(false);
}

export function undo(afterRender) {
  if (state._history.length <= 1) return; // nothing to undo
  const cur = state._history.pop();       // remove current
  state._future.push(cur);                // move to redo stack
  const prev = state._history[state._history.length - 1];
  applySnapshot(prev);
  if (afterRender) afterRender();
  setDirtyFlag(true);
}

export function redo(afterRender) {
  if (state._future.length === 0) return;
  const next = state._future.pop();
  // push current to history before applying redo snapshot
  state._history.push(next);
  applySnapshot(next);
  if (afterRender) afterRender();
  setDirtyFlag(true);
}
