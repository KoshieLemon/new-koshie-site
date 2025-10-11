// Fetch node catalog from the Kadie-AI node API and expose helpers.
import { api } from "../../assets/api.js"; // expects api.get(url)

let _catalog = null;

export async function loadNodeCatalog() {
  if (_catalog) return _catalog;
  // API returns { nodes: [...] }
  const res = await api.get("/nodes");
  const body = await res.json();
  _catalog = Array.isArray(body?.nodes) ? body.nodes : [];
  // Index by id for fast lookup
  _catalog._byId = Object.fromEntries(_catalog.map(n => [n.id, n]));
  return _catalog;
}

export function getNodeDef(id) {
  if (!_catalog) return null;
  return _catalog._byId[id] || null;
}

export function listNodes() {
  return _catalog || [];
}
