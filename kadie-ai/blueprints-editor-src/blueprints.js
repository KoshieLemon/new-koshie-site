// Blueprint loader with single-step diagnostics and hard verification.
// Steps:
// 1) Bubble event received
// 2) Sync legacy <select>
// 3) Load blueprint (ensure defs, fetch, normalize, ID match)
// 4) Update runtime state
// 5) Render graph + VERIFY (clears state first; checks DOM + active node)
// 6) Notify legacy listeners (disabled; we only drive from bp:selected)
// 7) Finalize UI

import { els } from "./dom.js";
import { state, snapshot, loadSnapshot, clearDirty } from "./state.js";
import { renderAll } from "./render.js";
import {
  listBlueprints,
  openBlueprint,
  saveBlueprint,
  createBlueprint,
  renameBlueprint,
  deleteBlueprint,
} from "./providers.js";
import { ensureNodesIndex } from "./nodes-index.js";

// ---------- diagnostics ----------
function stepLog(n, label, status, extra) {
  const tail = extra ? ` | ${extra}` : "";
  console.info(`[BP STEP ${n}] ${label}: ${status}${tail}`);
}

// ---------- util ----------
function pickActiveNodeId(graph) {
  const selId = state.sel && state.sel.size ? [...state.sel][0] : null;
  if (selId && graph.nodes?.some(n => n.id === selId)) return selId;
  return graph.nodes?.[0]?.id || null;
}

function verifyGraphRendered(graph) {
  const wantCount = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const haveCount = state.nodes instanceof Map ? state.nodes.size : 0;

  const missingInState = [];
  const missingInDom = [];

  const idsFromGraph = new Set((graph.nodes || []).map(n => n.id));
  for (const id of idsFromGraph) {
    if (!state.nodes.has(id)) missingInState.push(id);
  }
  for (const id of state.nodes.keys()) {
    const nodeEl = els.nodesLayer?.querySelector?.(`.node[data-nid="${CSS.escape(id)}"]`);
    if (!nodeEl) missingInDom.push(id);
  }

  const activeId = pickActiveNodeId(graph);
  const activeOK = activeId
    ? !!els.nodesLayer?.querySelector?.(`.node[data-nid="${CSS.escape(activeId)}"]`)
    : wantCount === 0;

  const ok =
    wantCount === haveCount &&
    missingInState.length === 0 &&
    missingInDom.length === 0 &&
    activeOK;

  const details = [
    `expected=${wantCount}`,
    `state=${haveCount}`,
    missingInState.length ? `missingInState=[${missingInState.join(",")}]` : "",
    missingInDom.length ? `missingInDom=[${missingInDom.join(",")}]` : "",
    `active=${activeId || "none"}`,
    `activeOK=${activeOK}`,
  ]
    .filter(Boolean)
    .join(" ");

  return { ok, details };
}

// ---------- list + open ----------
async function refreshList(gid, selectId = "") {
  await ensureNodesIndex();
  const sel = els.bpSelect;
  const list = await listBlueprints(gid);

  sel.innerHTML = "";
  for (const bp of list) {
    const o = document.createElement("option");
    o.value = bp.id;
    o.textContent = bp.name || bp.id;
    sel.appendChild(o);
  }

  if (list.length === 0) {
    els.overlay.style.display = "";
    return;
  }

  const id = selectId || state.bpId || list[0].id;
  sel.value = id;
  await openById(gid, id);
}

let loadSeq = 0; // concurrency guard

async function openById(gid, requestedId, seq = 0) {
  // Step 3: Load blueprint
  let bp = null;
  let graph = { nodes: [], edges: [] };

  try {
    await ensureNodesIndex();

    bp = await openBlueprint(gid, requestedId);
    if (!bp) {
      stepLog(3, "Load blueprint", "FAIL", "provider returned null");
      stepLog(4, "Update runtime state", "FAIL", "blocked by step 3");
      stepLog(5, "Render graph + VERIFY", "FAIL", "blocked by step 3");
      return { ok: false, reason: "no-blueprint" };
    }

    if (String(bp.id) !== String(requestedId)) {
      stepLog(3, "Load blueprint", "FAIL", `id-mismatch requested=${requestedId} got=${bp.id}`);
      return { ok: false, reason: "id-mismatch" };
    }

    const raw = bp.data?.graph ?? bp.data ?? {};
    graph = {
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
      edges: Array.isArray(raw.edges) ? raw.edges : [],
    };
    stepLog(3, "Load blueprint", "OK", `nodes=${graph.nodes.length}, edges=${graph.edges.length}`);
  } catch (e) {
    stepLog(3, "Load blueprint", "FAIL", e?.message || "exception");
    stepLog(4, "Update runtime state", "FAIL", "blocked by step 3");
    stepLog(5, "Render graph + VERIFY", "FAIL", "blocked by step 3");
    return { ok: false, reason: "exception" };
  }

  // abort if a newer request superseded this one
  if (seq && seq !== loadSeq) return { ok: false, reason: "superseded" };

  // Step 4: Update runtime state
  try {
    state.bpId = bp.id;
    state.bpName = bp.name || bp.id;
    stepLog(4, "Update runtime state", "OK", `id=${state.bpId}`);
  } catch (e) {
    stepLog(4, "Update runtime state", "FAIL", e?.message || "exception");
    stepLog(5, "Render graph + VERIFY", "FAIL", "blocked by step 4");
    return { ok: false, reason: "state-failure" };
  }

  if (seq && seq !== loadSeq) return { ok: false, reason: "superseded" };

  // Step 5: Render graph + VERIFY
  let verify = { ok: false, details: "" };
  try {
    // hard reset like delete-path does
    state.nodes?.clear?.();
    state.edges?.clear?.();
    renderAll(); // clear DOM before re-hydration

    loadSnapshot(graph, () => renderAll());
    verify = verifyGraphRendered(graph);
    stepLog(5, "Render graph + VERIFY", verify.ok ? "OK" : "FAIL", verify.details);
  } catch (e) {
    stepLog(5, "Render graph + VERIFY", "FAIL", e?.message || "exception");
    return { ok: false, reason: "render-failure" };
  }

  return { ok: verify.ok, reason: verify.ok ? "ok" : "verify-failed" };
}

// ---------- init + events ----------
export async function initBlueprints(gid) {
  const sel = els.bpSelect;
  const btnCreate = els.bpCreate;
  const btnRename = els.bpRename;
  const btnDelete = els.bpDelete;

  // Save buttons
  const btnSave =
    document.querySelector('[data-action="save"]') ||
    document.getElementById("bpSave") ||
    document.getElementById("saveBtn");
  if (btnSave) btnSave.addEventListener("click", async () => { await saveCurrentBlueprint(gid); });

  // Ignore programmatic <select> changes; only handle real user selection from dropdown
  sel?.addEventListener("change", async (e) => {
    if (!e.isTrusted) return; // dock fires synthetic; we ignore
    const id = sel.value;
    if (!id) { els.overlay.style.display = ""; return; }
    if (String(id) === String(state.bpId)) { stepLog(1, "Bubble event received", "OK", `id=${id} (already active; ignored)`); return; }
    const mySeq = ++loadSeq;
    const res = await openById(gid, id, mySeq);
    clearDirty(els.dirty);
    els.overlay.style.display = res.ok ? "none" : "";
    stepLog(7, "Finalize UI", res.ok ? "OK" : "FAIL", res.ok ? "overlay hidden" : "overlay shown");
  });

  // Bubble click path with strict 1..7 logs
  window.addEventListener("bp:selected", async (ev) => {
    const picked = String(ev?.detail?.id || "");
    const same = picked && String(picked) === String(state.bpId);
    stepLog(1, "Bubble event received", picked ? "OK" : "FAIL", picked ? `id=${picked}${same ? " (already active; ignored)" : ""}` : "missing id");
    if (!picked || same) return;

    // Step 2: Sync legacy <select>
    let step2Status = "OK";
    try {
      if (els.bpSelect) {
        els.bpSelect.value = picked;
        if (els.bpSelect.value !== picked) step2Status = "FAIL";
      } else {
        step2Status = "FAIL";
      }
    } catch { step2Status = "FAIL"; }
    stepLog(2, "Sync legacy <select>", step2Status);

    // Steps 3,4,5
    const mySeq = ++loadSeq;
    const res = await openById(gid, picked, mySeq);

    // Step 6: disabled to avoid double-loads
    stepLog(6, "Notify legacy listeners", "SKIP");

    // Step 7
    clearDirty(els.dirty);
    els.overlay.style.display = res.ok ? "none" : "";
    stepLog(7, "Finalize UI", res.ok ? "OK" : "FAIL", res.ok ? "overlay hidden" : "overlay shown");
  });

  // Create / Rename / Delete
  btnCreate?.addEventListener("click", async () => {
    const name = prompt("New blueprint name?")?.trim();
    if (!name) return;
    const bp = await createBlueprint(gid, { name });
    await refreshList(gid, bp.id);
  });

  btnRename?.addEventListener("click", async () => {
    if (!state.bpId) return;
    const name = prompt("Rename blueprint to?", state.bpName)?.trim();
    if (!name) return;
    await renameBlueprint(gid, { id: state.bpId, name });
    await refreshList(gid, state.bpId);
  });

  btnDelete?.addEventListener("click", async () => {
    if (!state.bpId) return;
    if (!confirm("Delete this blueprint?")) return;
    await deleteBlueprint(gid, { id: state.bpId });
    state.bpId = null;
    state.bpName = null;
    state.nodes.clear();
    state.edges.clear();
    els.overlay.style.display = "";
    await refreshList(gid, "");
    renderAll();
    clearDirty(els.dirty);
  });

  // initial load
  await refreshList(gid);
}

// ---------- save ----------
export async function saveCurrentBlueprint(gid) {
  if (!state.bpId) return false;
  const graph = JSON.parse(snapshot());
  const bp = { id: state.bpId, name: state.bpName, data: { graph, script: null } };
  try {
    const ok = await saveBlueprint(gid, bp);
    if (ok) clearDirty(els.dirty);
    return ok;
  } catch { return false; }
}
