// blueprints.open.js
// Strict open-by-id with graph load, paint, verification, and proper overlay timing.

import { state, loadSnapshot } from '../core/state.js';
import { renderAll } from '../render/render.js';
import { openBlueprint } from '../providers/providers.js';
import { ensureNodesIndex } from '../providers/nodes-index.js';
import { stepLog, showBusy, hideBusy, currentLoadSeq } from './blueprints.ctx.js';
import { canonicalId, verifyGraphRendered } from './blueprints.util.js';

// Wait for one animation frame
const nextFrame = () => new Promise(requestAnimationFrame);

// Poll verification across a few frames to allow DOM to paint
async function waitForVerification(graph, maxFrames = 8) {
  let verify = { ok: false, details: '' };
  for (let i = 0; i < maxFrames; i++) {
    await nextFrame();
    verify = verifyGraphRendered(graph);
    if (verify.ok) break;
  }
  return verify;
}

export async function openById(gid, requestedId, seq = 0) {
  showBusy('Loading blueprint…');

  let bp = null;
  let graph = { nodes: [], edges: [] };
  const req = canonicalId(requestedId);

  try {
    await ensureNodesIndex();

    bp = await openBlueprint(gid, req);
    if (!bp) {
      stepLog(3, 'Load blueprint', 'FAIL', 'provider returned null');
      hideBusy();
      return { ok: false, reason: 'no-blueprint' };
    }

    const want = String(req).toLowerCase();
    const got  = String(bp.id).toLowerCase();
    if (want !== got) {
      stepLog(3, 'Load blueprint', 'FAIL', `provider mismatch want=${want} got=${got}`);
      hideBusy();
      return { ok: false, reason: 'id-mismatch' };
    }

    const raw = bp.data?.graph ?? bp.data ?? {};
    graph = {
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
      edges: Array.isArray(raw.edges) ? raw.edges : [],
    };
    stepLog(3, 'Load blueprint', 'OK', `nodes=${graph.nodes.length}, edges=${graph.edges.length}`);
  } catch (e) {
    stepLog(3, 'Load blueprint', 'FAIL', e?.message || 'exception');
    hideBusy();
    return { ok: false, reason: 'exception' };
  }

  if (seq && seq !== currentLoadSeq()) { hideBusy(); return { ok: false, reason: 'superseded' }; }

  try {
    state.bpId = bp.id;
    state.bpName = bp.name || bp.id;
    stepLog(4, 'Update runtime state', 'OK', `id=${state.bpId}`);
  } catch (e) {
    stepLog(4, 'Update runtime state', 'FAIL', e?.message || 'exception');
    hideBusy();
    return { ok: false, reason: 'state-failure' };
  }

  if (seq && seq !== currentLoadSeq()) { hideBusy(); return { ok: false, reason: 'superseded' }; }

  // Render + paint + verify
  let verify = { ok: false, details: '' };
  try {
    // Clear current, force a paint, then load snapshot and paint again
    state.nodes?.clear?.();
    state.edges?.clear?.();
    renderAll();
    await nextFrame();

    loadSnapshot(graph, () => renderAll());
    await nextFrame();

    // Allow a few frames for DOM to fully realize nodes and edges
    verify = await waitForVerification(graph, 8);
    stepLog(5, 'Render graph + VERIFY', verify.ok ? 'OK' : 'FAIL', verify.details);
  } catch (e) {
    stepLog(5, 'Render graph + VERIFY', 'FAIL', e?.message || 'exception');
    hideBusy();
    return { ok: false, reason: 'render-failure' };
  }

  hideBusy();
  return { ok: verify.ok, reason: verify.ok ? 'ok' : 'verify-failed' };
}
