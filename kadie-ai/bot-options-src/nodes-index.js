// bot-options-src/nodes-index.js
/* eslint-disable no-console */
import { BOT_BASE as API } from './config.js';

let CACHE = { nodes: [], byId: new Map() };
let LOADED = false;

/** Normalize a node def from the API to what the UI expects. */
function normalize(def) {
  const ins  = Array.isArray(def?.inputs)  ? def.inputs  : [];
  const outs = Array.isArray(def?.outputs) ? def.outputs : [];

  const pins = {
    in:  ins.map(p => ({ name: String(p.name),  type: String(p.type || 'any') })),
    out: outs.map(p => ({ name: String(p.name), type: String(p.type || 'any') })),
  };

  const compat = {
    id:        String(def.id),
    name:      String(def.name || def.id),
    category:  String(def.category || ''),
    kind:      String(def.kind || 'exec'),
    version:   String(def.version || '1.0.0'),
    inputs:  pins.in,
    outputs: pins.out,
    pins,
    params:  pins.in,
    returns: pins.out,
    hasExecIn:  pins.in.some(p => p.type === 'exec'),
    hasExecOut: pins.out.some(p => p.type === 'exec'),
    runtime: def.runtime || null,
    discord: def.discord || null,
  };
  return compat;
}

function injectVirtualNodes(nodes, byId){
  if (!byId.has('utils.breakObject')) {
    const v = normalize({
      id: 'utils.breakObject',
      name: 'Break Object',
      category: 'Utilities',
      kind: 'exec',
      version: '1.0.0',
      inputs:  [{ name:'in', type:'exec' }, { name:'object', type:'any' }],
      outputs: [{ name:'out', type:'exec' }],
    });
    nodes.push(v);
    byId.set(v.id, v);
  }
}

export async function fetchNodesIndex() {
  const url = `${API}/nodes-index`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const txt = await r.text().catch(() => '');
  if (!r.ok) {
    console.error('[nodes-index] GET /nodes-index failed', r.status, txt);
    CACHE = { nodes: [], byId: new Map() };
    LOADED = false;
    window.NODE_INDEX = [];
    window.NODE_DEFS = {};
    return CACHE;
  }

  const data = txt ? JSON.parse(txt) : {};
  const raw  = Array.isArray(data?.nodes) ? data.nodes : [];
  const nodes = raw.map(normalize);
  const byId  = new Map(nodes.map(n => [n.id, n]));

  injectVirtualNodes(nodes, byId);

  CACHE = { nodes, byId };
  LOADED = true;

  window.NODE_INDEX = nodes;
  window.NODE_DEFS  = Object.fromEntries(byId);

  console.groupCollapsed('[nodes-index] loaded', nodes.length, 'defs');
  console.table(nodes.map(n => ({
    id: n.id, kind: n.kind, in: n.inputs.length, out: n.outputs.length,
    execIn: n.hasExecIn, execOut: n.hasExecOut
  })));
  window.__printNode = (id) => {
    const n = byId.get(id);
    if (!n) return console.warn('node not found', id);
    console.group(`[node] ${id}`);
    console.log('inputs:', n.inputs);
    console.log('outputs:', n.outputs);
    console.log('pins:', n.pins);
    console.groupEnd();
    return n;
  };
  console.groupEnd();

  return CACHE;
}

export async function ensureNodesIndex() {
  if (!LOADED || CACHE.nodes.length === 0) return fetchNodesIndex();
  return CACHE;
}

export function getNodeDef(defId) {
  return CACHE.byId.get(defId) || null;
}

export function groupNodesByCategory(list) {
  const root = {};
  for (const def of list) {
    const parts = String(def.category || '').split('.').filter(Boolean);
    let cur = root;
    for (const p of parts) cur = (cur[p] ||= {});
    cur[def.name] = { __leaf: def, id: def.id };
  }
  return root;
}
