// Minimal graph state with param storage and connection checks used by render.js.
export const state = {
  nodes: new Map(),     // id -> { id, typeId, params: {}, connections: {in:{pin: nodeId.pin}, out:{...}} }
  edges: []             // [{ from: {nodeId, pin}, to: {nodeId, pin} }]
};

export function addNode(node) {
  state.nodes.set(node.id, { ...node, params: node.params || {}, connections: node.connections || { in: {}, out: {} } });
}

export function isPinConnected(nodeId, pinName, direction /* "in"|"out" */) {
  const edges = state.edges;
  return edges.some(e => {
    if (direction === "in") return e.to.nodeId === nodeId && e.to.pin === pinName;
    return e.from.nodeId === nodeId && e.from.pin === pinName;
  });
}

export function setNodeParam(nodeId, key, value) {
  const n = state.nodes.get(nodeId);
  if (!n) return;
  n.params[key] = value;
}

export function exportBlueprint() {
  // Convert to engine-friendly format
  const nodes = Array.from(state.nodes.values()).map(n => ({
    id: n.id,
    typeId: n.typeId,
    params: n.params,
  }));
  const edges = state.edges.map(e => ({ from: e.from, to: e.to }));
  return { nodes, edges };
}
