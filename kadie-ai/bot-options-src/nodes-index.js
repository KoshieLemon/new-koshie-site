// bot-options-src/nodes-index.js
/* eslint-disable no-console */
import { BOT_BASE as API } from './config.js';

let CACHE = { nodes: [], byId: new Map() };
let LOADED = false;

/** Normalize a node def from the API to what the UI expects. */
function normalize(def) {
  const ins  = Array.isArray(def?.inputs)  ? def.inputs  : [];
  const outs = Array.isArray(def?.outputs) ? def.outputs : [];

  // Build pins the way the legacy UI expects
  const pins = {
    in:  ins.map(p => ({ name: String(p.name),  type: String(p.type || 'any') })),
    out: outs.map(p => ({ name: String(p.name), type: String(p.type || 'any') })),
  };

  const compat = {
    id:        String(def.id),
    name:      String(def.name || def.id),
    category:  String(def.category || ''),
    kind:      String(def.kind || 'exec'), // 'event' | 'exec'
    version:   String(def.version || '1.0.0'),

    // canonical
    inputs:  pins.in,
    outputs: pins.out,

    // legacy aliases used by older site code
    pins,
    params:  pins.in,
    returns: pins.out,

    // convenience flags
    hasExecIn:  pins.in.some(p => p.type === 'exec'),
    hasExecOut: pins.out.some(p => p.type === 'exec'),

    runtime: def.runtime || null,
    discord: def.discord || null,
  };

  return compat;
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

  CACHE = { nodes, byId };
  LOADED = true;

  // expose for renderer + debugging
  window.NODE_INDEX = nodes;
  window.NODE_DEFS  = Object.fromEntries(byId);

  // ---- DEBUG OUTPUTS YOU ASKED FOR ----
  console.groupCollapsed('[nodes-index] loaded', nodes.length, 'defs (normalized for UI)');
  console.table(nodes.map(n => ({
    id: n.id,
    kind: n.kind,
    in: n.inputs.length,
    out: n.outputs.length,
    execIn: n.hasExecIn,
    execOut: n.hasExecOut
  })));
  // helper to inspect a single node shape in detail
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
  // -------------------------------------

  return CACHE;
}

// Back-compat for older imports
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
