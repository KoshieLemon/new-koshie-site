// Blueprint list + active loader with single-step diagnostics.
// Steps:
// 1) Bubble event received
// 2) Sync legacy <select>
// 3) Load blueprint (ensure defs, fetch, normalize)
// 4) Update runtime state
// 5) Render graph + VERIFY active node and DOM consistency
// 6) Notify legacy listeners
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

// ---------- diagnostics (one line per step) ----------
function stepLog(n, label, status, extra) {
  const tail = extra ? ` | ${extra}` : "";
  console.info(`[BP STEP ${n}] ${label}: ${status}${tail}`);
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

function pickActiveNodeId(graph) {
  // Prefer a currently selected node that exists; else first node in graph; else null
  const selId = state.sel && state.sel.size ? [...state.sel][0] : null;
  if (selId && graph.nodes?.some(n => n.id === selId)) return selId;
  return graph.nodes?.[0]?.id || null;
}

function verifyGraphRendered(graph) {
  // Invariants:
  // - state.nodes size must equal graph.nodes length
  // - for each state node there must be a DOM element .node[data-nid=id]
  // - chosen active node must exist in DOM
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
    : wantCount === 0; // if no nodes expected, treat as OK

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

async function openById(gid, id) {
  // Step 3: Load blueprint
  let bp = null;
  let graph = { nodes: [], edges: [] };
  try {
    await ensureNodesIndex();

    bp = await openBlueprint(gid, id);
    if (!bp) {
      stepLog(3, "Load blueprint", "FAIL", "provider returned null");
      stepLog(4, "Update runtime state", "FAIL", "blocked by step 3");
      stepLog(5, "Render graph + VERIFY", "FAIL", "blocked by step 3");
      return { ok: false, reason: "no-blueprint" };
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

  // Step 5: Render graph + VERIFY active node and DOM consistency
  let verify = { ok: false, details: "" };
  try {
    loadSnapshot(graph, () => renderAll());
    verify = verifyGraphRendered(graph);
    stepLog(5, "Render graph + VERIFY", verify.ok ? "OK" : "FAIL", verify.details);
  } catch (e) {
    stepLog(5, "Render graph + VERIFY", "FAIL", e?.message || "exception");
    return { ok: false, reason: "render-failure" };
  }

  // Return status so caller can decide steps 6 and 7 behavior
  return { ok: verify.ok, reason: verify.ok ? "ok" : "verify-failed" };
}

// ---------- init + events ----------
let suppressSelectChange = false;

export async function initBlueprints(gid) {
  const sel = els.bpSelect;
  const btnCreate = els.bpCreate;
  const btnRename = els.bpRename;
  const btnDelete = els.bpDelete;

  // Save buttons (top bar or legacy)
  const btnSave =
    document.querySelector('[data-action="save"]') ||
    document.getElementById("bpSave") ||
    document.getElementById("saveBtn");

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      await saveCurrentBlueprint(gid);
    });
  }

  // Legacy <select> path
  sel?.addEventListener("change", async () => {
    if (suppressSelectChange) return;
    const id = sel.value;
    if (!id) { els.overlay.style.display = ""; return; }
    const res = await openById(gid, id);
    // Step 7: Finalize UI
    clearDirty(els.dirty);
    els.overlay.style.display = res.ok ? "none" : "";
    stepLog(7, "Finalize UI", res.ok ? "OK" : "FAIL", res.ok ? "overlay hidden" : "overlay shown");
  });

  // Bubble click path with strict 1..7 step logs
  window.addEventListener("bp:selected", async (ev) => {
    const picked = String(ev?.detail?.id || "");
    stepLog(1, "Bubble event received", picked ? "OK" : "FAIL", picked ? `id=${picked}` : "missing id");
    if (!picked) return;

    // Step 2: Sync legacy <select>
    let step2Status = "OK";
    try {
      if (sel) {
        suppressSelectChange = true;
        sel.value = picked;
        if (sel.value !== picked) step2Status = "FAIL";
      } else {
        step2Status = "FAIL";
      }
    } catch {
      step2Status = "FAIL";
    }
    stepLog(2, "Sync legacy <select>", step2Status);
    if (step2Status === "FAIL") suppressSelectChange = false;

    // Steps 3,4,5 handled inside openById
    const res = await openById(gid, picked);

    // Step 6: Notify legacy listeners
    let step6Status = "OK";
    try {
      if (res.ok && sel) {
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (!res.ok) {
        step6Status = "FAIL";
      }
    } catch {
      step6Status = "FAIL";
    } finally {
      suppressSelectChange = false;
    }
    stepLog(6, "Notify legacy listeners", step6Status);

    // Step 7: Finalize UI
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
  } catch {
    return false;
  }
}
