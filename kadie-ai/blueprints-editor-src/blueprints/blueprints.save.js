// blueprints.save.js
// Save current blueprint with busy overlay.

import { state, snapshot, clearDirty } from '../core/state.js';
import { saveBlueprint } from '../providers/providers.js';
import { showBusy, hideBusy } from './blueprints.ctx.js';

export async function saveCurrentBlueprint(gid){
  if (!state.bpId) return false;
  const graph = JSON.parse(snapshot());
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
