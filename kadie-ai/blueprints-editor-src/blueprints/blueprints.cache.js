// blueprints.cache.js
// In-memory cache of blueprint graphs with per-blueprint baseline for revert.
// Map<string, { id, name, graph, baseline, exists }>
function cloneGraph(g) {
  const nodes = Array.isArray(g?.nodes) ? g.nodes.map(n => ({ ...n })) : [];
  const edges = Array.isArray(g?.edges) ? g.edges.map(e => ({ ...e })) : [];
  return { nodes, edges };
}

const MAP = new Map();

export const Cache = {
  put(id, { name, graph, exists = true }) {
    const key = String(id);
    const entry = {
      id: key,
      name: String(name || id),
      graph: cloneGraph(graph),
      baseline: cloneGraph(graph),
      exists: !!exists,
    };
    MAP.set(key, entry);
    return entry;
  },
  get(id) {
    return MAP.get(String(id)) || null;
  },
  has(id) {
    return MAP.has(String(id));
  },
  updateGraph(id, graph) {
    const e = MAP.get(String(id));
    if (!e) return null;
    e.graph = cloneGraph(graph);
    return e;
  },
  setBaseline(id, graphOrNull = null) {
    const e = MAP.get(String(id));
    if (!e) return null;
    e.baseline = graphOrNull ? cloneGraph(graphOrNull) : cloneGraph(e.graph);
    return e;
  },
  rename(id, name) {
    const e = MAP.get(String(id));
    if (!e) return null;
    e.name = String(name || e.name);
    return e;
  },
  markExists(id, exists = true) {
    const e = MAP.get(String(id));
    if (!e) return null;
    e.exists = !!exists;
    return e;
  },
  replaceId(oldId, newId) {
    const a = String(oldId), b = String(newId);
    const e = MAP.get(a);
    if (!e) return null;
    MAP.delete(a);
    e.id = b;
    MAP.set(b, e);
    return e;
  },
  all() {
    return [...MAP.values()];
  },
};
