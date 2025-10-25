// blueprints.save.js
// Save current graph. Create path first for unsaved or imported entries.

import { els } from '../core/dom.js';
import { state, snapshot, clearDirty } from '../core/state.js';
import { createBlueprint, saveBlueprint } from '../providers/providers.js';
import { showBusy, hideBusy, stepLog } from './blueprints.ctx.js';
import { refreshList } from './blueprints.list.js';
import { Cache } from './blueprints.cache.js';

export async function saveCurrentBlueprint(gid) {
  if (!gid || !state.bpId) return false;

  // Serialize the in-memory graph.
  let graph;
  try {
    graph = JSON.parse(snapshot());
  } catch {
    stepLog(8, 'Save blueprint', 'FAIL', 'snapshot parse error');
    return false;
  }

  showBusy('Saving…');

  try {
    let entry = Cache.get(state.bpId);
    if (!entry) {
      entry = Cache.put(state.bpId, { name: state.bpName || state.bpId, graph, exists: false });
    } else {
      Cache.updateGraph(state.bpId, graph);
    }

    // Create path first if this is a draft/import that does not exist yet.
    if (!entry.exists || String(state.bpId).startsWith('import-')) {
      const created = await createBlueprint(gid, { name: entry.name });
      const oldId = state.bpId;

      // Move cache entry to the server id and mark as existing.
      entry = Cache.replaceId(oldId, created.id);
      Cache.markExists(created.id, true);
      entry.name = created.name;

      // Sync runtime + UI.
      state.bpId = created.id;
      state.bpName = created.name;
      await refreshList(gid, state.bpId);
      if (els.bpSelect) els.bpSelect.value = state.bpId;

      stepLog(8, 'Create blueprint path', 'OK', `old=${oldId} new=${created.id}`);
    }

    // Persist graph.
    await saveBlueprint(gid, {
      id: state.bpId,
      name: state.bpName || state.bpId,
      data: { graph, script: null },
    });

    // Update baseline so Revert restores this exact save.
    Cache.setBaseline(state.bpId, graph);

    clearDirty(els.dirty);
    stepLog(8, 'Save blueprint', 'OK', `id=${state.bpId} nodes=${graph.nodes.length} edges=${graph.edges.length}`);
    return true;
  } catch (e) {
    stepLog(8, 'Save blueprint', 'FAIL', e?.message || 'error');
    return false;
  } finally {
    hideBusy();
  }
}
