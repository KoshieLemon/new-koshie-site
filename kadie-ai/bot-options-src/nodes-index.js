import { BOT_BASE } from './config.js';

export async function fetchNodesIndex(){
  const r = await fetch(`${BOT_BASE}/nodes-index`).catch(()=>null);
  if (!r || !r.ok) return { nodes: [] };
  return r.json();
}

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
