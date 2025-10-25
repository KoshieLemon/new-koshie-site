// blueprints.open.js
// Open by id. Instantly switch using cache. Only fetch once per id.

import { state, loadSnapshot, snapshot } from '../core/state.js';
import { renderAll } from '../render/render.js';
import { openBlueprint } from '../providers/providers.js';
import { ensureNodesIndex } from '../providers/nodes-index.js';
import { stepLog, showBusy, hideBusy, currentLoadSeq } from './blueprints.ctx.js';
import { canonicalId, verifyGraphRendered } from './blueprints.util.js';
import { Cache } from './blueprints.cache.js';

const nextFrame = () => new Promise(requestAnimationFrame);

async function waitForVerification(graph, maxFrames = 6) {
  let verify = { ok: false, details: '' };
  for (let i = 0; i < maxFrames; i++) {
    await nextFrame();
    verify = verifyGraphRendered(graph);
    if (verify.ok) break;
  }
  return verify;
}

export async function openById(gid, requestedId, seq = 0) {
  const req = canonicalId(requestedId);
  if (!req) return { ok: false, reason: 'no-id' };

  // Persist current edits of the active blueprint into cache before switching.
  try {
    if (state.bpId) Cache.updateGraph(state.bpId, JSON.parse(snapshot()));
  } catch {}

  showBusy('Opening…');

  // Fast path: cache hit.
  let entry = Cache.get(req);
  let graph, name, id;

  try {
    await ensureNodesIndex();
    if (entry) {
      ({ id, name } = entry);
      graph = entry.graph;
      stepLog(3, 'Load blueprint (cache)', 'OK', `id=${id} nodes=${graph.nodes.length} edges=${graph.edges.length}`);
    } else {
      // Fetch once then seed cache.
      const bp = await openBlueprint(gid, req);
      if (!bp) {
        stepLog(3, 'Load blueprint', 'FAIL', 'provider returned null');
        hideBusy();
        return { ok: false, reason: 'no-blueprint' };
      }
      id = String(bp.id);
      name = String(bp.name || bp.id);
      const raw = bp.data?.graph ?? bp.data ?? {};
      graph = {
        nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
        edges: Array.isArray(raw.edges) ? raw.edges : [],
      };
      entry = Cache.put(id, { name, graph, exists: true });
      stepLog(3, 'Load blueprint (network)', 'OK', `id=${id} nodes=${graph.nodes.length} edges=${graph.edges.length}`);
    }
  } catch (e) {
    stepLog(3, 'Load blueprint', 'FAIL', e?.message || 'exception');
    hideBusy();
    return { ok: false, reason: 'exception' };
  }

  if (seq && seq !== currentLoadSeq()) { hideBusy(); return { ok: false, reason: 'superseded' }; }

  // Update runtime state.
  state.gid = gid;
  state.bpId = id;
  state.bpName = name;
  stepLog(4, 'Update runtime state', 'OK', `id=${state.bpId}`);

  // Render from cached graph. No network.
  let verify = { ok: false, details: '' };
  try {
    state.nodes?.clear?.();
    state.edges?.clear?.();
    renderAll();
    await nextFrame();

    loadSnapshot(graph, () => renderAll());
    await nextFrame();

    verify = await waitForVerification(graph, 6);
    stepLog(5, 'Render graph + VERIFY', verify.ok ? 'OK' : 'FAIL', verify.details);
  } catch (e) {
    stepLog(5, 'Render graph + VERIFY', 'FAIL', e?.message || 'exception');
    hideBusy();
    return { ok: false, reason: 'render-failure' };
  }

  hideBusy();
  return { ok: verify.ok, reason: verify.ok ? 'ok' : 'verify-failed' };
}
