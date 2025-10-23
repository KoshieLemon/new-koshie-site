// blueprints.save.js
// Save current blueprint with busy overlay.

import { state, snapshot, clearDirty } from '../core/state.js';
import { saveBlueprint } from '../providers/providers.js';
import { showBusy, hideBusy } from './blueprints.ctx.js';

const MAX_NODES = 70;

export async function saveCurrentBlueprint(gid){
  if (!state.bpId) return false;

  const graph = JSON.parse(snapshot());

  // Robust node count across possible shapes
  let nodeCount = 0;
  const nodes = graph?.nodes;
  if (Array.isArray(nodes)) nodeCount = nodes.length;
  else if (nodes && typeof nodes === 'object') nodeCount = Object.keys(nodes).length;
  else if (state?.nodes && typeof state.nodes.size === 'number') nodeCount = state.nodes.size || 0;

  if (nodeCount > MAX_NODES){
    alert(`Save blocked. This blueprint has ${nodeCount} nodes. The limit is ${MAX_NODES}. Remove nodes before saving.`);
    return false;
  }

  const bp = { id: state.bpId, name: state.bpName, data: { graph, script: null } };
  showBusy('Saving…');
  try{
    const ok = await saveBlueprint(gid, bp);
    if (ok) clearDirty(document.getElementById('dirty'));
    return ok;
  }catch{
    return false;
  }finally{
    hideBusy();
  }
}
