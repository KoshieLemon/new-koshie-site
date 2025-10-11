import { BOT_BASE } from './config.js';

let cache = null;              // { nodes:[{id,inputs,outputs,...}] }
let defsMap = null;            // Map<id, def>

/** Fetch and cache from kadie-ai-node */
export async function fetchNodesIndex(){
  if (cache) return cache;
  const r = await fetch(`${BOT_BASE}/nodes-index`).catch(()=>null);
  cache = (!r || !r.ok) ? { nodes: [] } : await r.json();
  defsMap = new Map((cache.nodes || []).map(n => [n.id, n]));
  // expose for renderers that don’t import this module
  window.NODE_DEFS = defsMap;
  window.dispatchEvent(new CustomEvent('nodes-index:ready'));
  if (!cache.nodes?.length) console.warn('[nodes-index] empty set from API');
  return cache;
}

/** Ensure cache exists before UI tries to render pins */
export async function ensureNodesIndex(){
  if (!cache) await fetchNodesIndex();
  return cache;
}

/** Lookup full node def by id */
export function getNodeDef(id){
  return defsMap?.get(id) || null;
}

/** Build category tree for the right-click menu */
export function groupNodesByCategory(nodes){
  const tree = {};
  for (const n of nodes || []){
    const parts = String(n.id).split('.');
    let cur = tree;
    for (let i=0;i<parts.length;i++){
      const p = parts[i];
      if (!cur[p]) cur[p] = (i === parts.length-1 ? { __leaf: n } : {});
      cur = cur[p];
    }
  }
  return tree;
}
