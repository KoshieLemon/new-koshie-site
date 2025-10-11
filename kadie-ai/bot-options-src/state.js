// ESM. Minimal defaults store used by render.js.
const g = {
  nodes: new Map() // id -> { defaults: {pin: value}, connections: { [pin]: boolean } }
};

export function ensureNode(id) {
  if (!g.nodes.has(id)) g.nodes.set(id, { defaults: {}, connections: {} });
  return g.nodes.get(id);
}

export function getGraphState() {
  return g;
}

export function setNodeInputDefault(id, pin, value) {
  const n = ensureNode(id);
  n.defaults[pin] = value;
}

export function setInputConnection(id, pin, connected) {
  const n = ensureNode(id);
  n.connections[pin] = !!connected;
}

export function isInputConnected(id, pin) {
  const n = ensureNode(id);
  return !!n.connections[pin];
}
