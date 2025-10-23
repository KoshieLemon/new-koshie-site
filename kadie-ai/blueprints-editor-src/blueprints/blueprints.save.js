// blueprints.save.js
// Save current blueprint with busy overlay and client-side limits.

import { state, snapshot, clearDirty } from '../core/state.js';
import { saveBlueprint } from '../providers/providers.js';
import { showBusy, hideBusy } from './blueprints.ctx.js';
import { toast } from '../core/notify.js';

const MAX_NODES = 70;

function codeFromError(e){
  try{
    if (e?.error) return String(e.error);
    if (e?.response?.error) return String(e.response.error);
    if (typeof e?.message === 'string'){
      const m = /"error"\s*:\s*"([^"]+)"/.exec(e.message);
      if (m) return m[1];
    }
  }catch{}
  return null;
}

export async function saveCurrentBlueprint(gid){
  if (!state.bpId) return false;

  let graph;
  try { graph = JSON.parse(snapshot()); }
  catch { toast('Invalid graph JSON.', { kind:'error' }); return false; }

  // Client-side enforcement for node count
  const nodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
  if (nodeCount > MAX_NODES){
    toast(`Maximum nodes per blueprint is ${MAX_NODES}. Current: ${nodeCount}.`, { kind:'error' });
    return false;
  }

  const bp = { id: state.bpId, name: state.bpName, data: { graph, script: null } };
  showBusy('Saving…');
  try{
    const ok = await saveBlueprint(gid, bp);
    if (ok) clearDirty(document.getElementById('dirty'));
    else toast('Save failed.', { kind:'error' });
    return !!ok;
  }catch(e){
    const code = codeFromError(e);
    if (code === 'too_many_nodes'){
      toast(`Maximum nodes per blueprint is ${MAX_NODES}.`, { kind:'error' });
    } else {
      toast('Save failed.', { kind:'error' });
    }
    return false;
  }finally{
    hideBusy();
  }
}
