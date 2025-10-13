// /bot-options-src/state.js
export const state = {
  nodes: new Map(),        // Map<nodeId, {id,defId,x,y,params,_defOverride?}>
  edges: new Map(),        // Map<edgeId, {id,kind,from:{nid,pin},to:{nid,pin},type?}>
  sel: new Set(),          // Set<nodeId>
  view: { x: 0, y: 0, z: 1 },
  bpId: null,
  bpName: null,
  hist: [],
  histIdx: -1,
};

export function uid(prefix = 'N') {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

function cloneGraph() {
  const nodes = [];
  for (const n of state.nodes.values()) {
    nodes.push({ id: String(n.id), defId: String(n.defId), x: Number(n.x)||0, y: Number(n.y)||0, params: { ...(n.params||{}) } });
  }
  const edges = [];
  for (const e of state.edges.values()) {
    edges.push({
      id: String(e.id || uid('E')),
      kind: e.kind || 'data',
      type: e.type || null,
      from: { nid: String(e.from?.nid), pin: String(e.from?.pin) },
      to:   { nid: String(e.to?.nid),   pin: String(e.to?.pin)   },
    });
  }
  return { nodes, edges };
}

export function snapshot() { return JSON.stringify(cloneGraph()); }

export function loadSnapshot(graph, after) {
  state.nodes.clear(); state.edges.clear(); state.sel.clear();
  const g = graph || { nodes: [], edges: [] };
  if (Array.isArray(g.nodes)) {
    for (const n of g.nodes) {
      state.nodes.set(String(n.id), {
        id: String(n.id), defId: String(n.defId),
        x: Number(n.x)||0, y: Number(n.y)||0,
        params: { ...(n.params||{}) }
      });
    }
  }
  if (Array.isArray(g.edges)) {
    for (const e of g.edges) {
      const id = String(e.id || uid('E'));
      state.edges.set(id, {
        id,
        kind: e.kind || 'data',
        type: e.type || null,
        from: { nid: String(e.from?.nid), pin: String(e.from?.pin) },
        to:   { nid: String(e.to?.nid),   pin: String(e.to?.pin)   },
      });
    }
  }
  if (typeof after === 'function') after();
  updateUndoRedoButtons();
}

export function pushHistory() {
  const snap = snapshot();
  if (state.histIdx < state.hist.length - 1) state.hist = state.hist.slice(0, state.histIdx + 1);
  state.hist.push(snap);
  if (state.hist.length > 50) state.hist.shift();
  state.histIdx = state.hist.length - 1;
  updateUndoRedoButtons();
}

export function undo(after) {
  if (state.histIdx <= 0) return;
  state.histIdx--;
  loadSnapshot(JSON.parse(state.hist[state.histIdx]), after);
}

export function redo(after) {
  if (state.histIdx >= state.hist.length - 1) return;
  state.histIdx++;
  loadSnapshot(JSON.parse(state.hist[state.histIdx]), after);
}

function updateUndoRedoButtons() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (u) u.disabled = !(state.histIdx > 0);
  if (r) r.disabled = !(state.histIdx >= 0 && state.histIdx < state.hist.length - 1);
}

export function markDirty(el)  { if (el) el.classList.add('show'); }
export function clearDirty(el) { if (el) el.classList.remove('show'); }
