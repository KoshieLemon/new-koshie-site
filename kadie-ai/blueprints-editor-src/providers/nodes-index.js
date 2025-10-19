/* eslint-disable no-console */
import { BOT_BASE as API } from '../core/config.js';

let CACHE = { nodes: [], byId: new Map() };
let LOADED = false;

function mapPin(p) {
  return {
    name: String(p.name),
    type: String(p.type || 'any'),
    optional: !!p.optional,
    ...(typeof p.desc === 'string' && p.desc.trim() ? { desc: p.desc } : {})
  };
}

function normalize(def) {
  const ins  = Array.isArray(def?.inputs)  ? def.inputs  : [];
  const outs = Array.isArray(def?.outputs) ? def.outputs : [];

  const inPins  = ins.map(mapPin);
  const outPins = outs.map(mapPin);

  return {
    id:        String(def.id),
    name:      String(def.name || def.id),
    category:  String(def.category || ''),
    kind:      String(def.kind || 'exec'),
    version:   String(def.version || '1.0.0'),
    description: typeof def.description === 'string' ? def.description : '',

    inputs:  inPins,
    outputs: outPins,

    // legacy fields some parts of the UI expect
    pins:   { in: inPins, out: outPins },
    params: inPins,
    returns: outPins,

    hasExecIn:  inPins.some(p => p.type === 'exec'),
    hasExecOut: outPins.some(p => p.type === 'exec'),

    runtime: def.runtime || null,
    discord: def.discord || null,
    hidden: !!def.hidden,
    tags: Array.isArray(def.tags) ? def.tags.slice() : [],
  };
}

// Add virtual nodes that are editor-defined (not served by /nodes-index)
function injectVirtualNodes(nodes, byId){
  if (!byId.has('flow.breakObject')) {
    const v = normalize({
      id: 'flow.breakObject',
      name: 'Break Object',
      category: 'flow',
      kind: 'exec',
      version: '1.0.0',
      // single data input; dynamic outputs created client-side on connect
      inputs: [
        { name: 'in', type: 'exec' },
        { name: 'object', type: 'any' }
      ],
      outputs: [
        { name: 'out', type: 'exec' }
      ],
      tags: ['flow','introspection']
    });
    nodes.push(v);
    byId.set(v.id, v);
  }
}

export async function fetchNodesIndex() {
  const url = `${API}/nodes-index`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) {
      CACHE = { nodes: [], byId: new Map() };
      window.NODE_INDEX = [];
      window.NODE_DEFS  = {};
      return CACHE;
    }
    const data = await r.json().catch(() => ({}));
    const raw  = Array.isArray(data?.nodes) ? data.nodes : [];
    const all  = raw.map(normalize);
    const byId = new Map(all.map(n => [n.id, n]));
    const nodes = all.filter(n => !n.hidden);

    // ensure Break Object exists for the editor
    injectVirtualNodes(nodes, byId);

    CACHE = { nodes, byId }; LOADED = true;
    window.NODE_INDEX = nodes;
    window.NODE_DEFS  = Object.fromEntries(byId);
    return CACHE;
  } catch {
    CACHE = { nodes: [], byId: new Map() };
    window.NODE_INDEX = [];
    window.NODE_DEFS  = {};
    return CACHE;
  }
}

export async function ensureNodesIndex() {
  if (!LOADED || CACHE.nodes.length === 0) return fetchNodesIndex();
  return CACHE;
}

export function getNodeDef(defId) { return CACHE.byId.get(defId) || null; }

export function groupNodesByCategory(list) {
  const root = {};
  for (const def of list) {
    const parts = String(def.category || '').split('.').filter(Boolean);
    let cur = root; for (const p of parts) cur = (cur[p] ||= {});
    cur[def.name] = def.id;
  }
  return root;
}
