// Loader with strict id matching, busy overlay, and verification.
// No auto-load at startup or after delete. Busy overlay on switch/save/delete.
// Supports external delete and rename requests without selecting.

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

/* ----------------------------- diagnostics ----------------------------- */
function stepLog(n, label, status, extra) {
  const tail = extra ? ` | ${extra}` : "";
  console.info(`[BP STEP ${n}] ${label}: ${status}${tail}`);
}

/* ------------------------------ busy overlay --------------------------- */
let BUSY = false;

function ensureBusyUI() {
  if (document.getElementById("bp-busy-style")) return;

  const css = document.createElement("style");
  css.id = "bp-busy-style";
  css.textContent = `
    #appBusy{
      position:fixed; inset:0; z-index:2000;
      display:none; align-items:center; justify-content:center;
      background:rgba(10,12,18,.62); backdrop-filter:blur(2px);
      cursor:progress; pointer-events:all;
    }
    #appBusy .wrap{ display:flex; flex-direction:column; align-items:center; gap:10px; }
    #appBusy .spinner{
      width:56px; height:56px; border-radius:50%;
      border:4px solid #3b82f6; border-top-color:transparent;
      animation:bpSpin .9s linear infinite; box-shadow:0 0 18px #3b82f688;
    }
    #appBusy .msg{ color:#e5e7eb; font:600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; opacity:.95; }
    @keyframes bpSpin{ to{ transform:rotate(360deg) } }
  `;
  document.head.appendChild(css);

  const ov = document.createElement("div");
  ov.id = "appBusy";
  ov.innerHTML = `<div class="wrap"><div class="spinner"></div><div class="msg">Loading blueprint…</div></div>`;
  document.body.appendChild(ov);

  const stopAll = (e) => { if (BUSY) { e.preventDefault(); e.stopPropagation(); } };
  window.addEventListener("pointerdown", stopAll, true);
  window.addEventListener("wheel", stopAll, { passive: false, capture: true });
  window.addEventListener("keydown", stopAll, true);
}

function showBusy(text = "Loading blueprint…") {
  ensureBusyUI();
  BUSY = true;
  const el = document.getElementById("appBusy");
  if (el) {
    const msg = el.querySelector(".msg");
    if (msg) msg.textContent = text;
    el.style.display = "flex";
  }
}

function hideBusy() {
  BUSY = false;
  const el = document.getElementById("appBusy");
  if (el) el.style.display = "none";
}

/* --------------------------------- utils ------------------------------- */
function canonicalId(idOrName) {
  const opts = Array.from(els.bpSelect?.options || []);
  const v = String(idOrName ?? "");
  const byVal = opts.find((o) => String(o.value) === v);
  if (byVal) return String(byVal.value);
  const vTrim = v.trim().toLowerCase();
  const byText = opts.find((o) => String(o.textContent || "").trim().toLowerCase() === vTrim);
  return byText ? String(byText.value) : v;
}

function pickActiveNodeId(graph) {
  const selId = state.sel && state.sel.size ? [...state.sel][0] : null;
  if (selId && graph.nodes?.some((n) => n.id === selId)) return selId;
  return graph.nodes?.[0]?.id || null;
}

function verifyGraphRendered(graph) {
  const want = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const have = state.nodes instanceof Map ? state.nodes.size : 0;

  const missingInState = [];
  const missingInDom = [];

  const ids = new Set((graph.nodes || []).map((n) => n.id));
  for (const id of ids) if (!state.nodes.has(id)) missingInState.push(id);

  for (const id of state.nodes.keys()) {
    const nodeEl = els.nodesLayer?.querySelector?.(`.node[data-nid="${CSS.escape(id)}"]`);
    if (!nodeEl) missingInDom.push(id);
  }

  const activeId = pickActiveNodeId(graph);
  const activeOK = activeId
    ? !!els.nodesLayer?.querySelector?.(`.node[data-nid="${CSS.escape(activeId)}"]`)
    : want === 0;

  const ok = want === have && missingInState.length === 0 && missingInDom.length === 0 && activeOK;
  const details = [
    `expected=${want}`,
    `state=${have}`,
    missingInState.length ? `missingInState=[${missingInState.join(",")}]` : "",
    missingInDom.length ? `missingInDom=[${missingInDom.join(",")}]` : "",
    `active=${activeId || "none"}`,
    `activeOK=${activeOK}`,
  ]
    .filter(Boolean)
    .join(" ");

  return { ok, details };
}

/* ----------------------------- list (no open) -------------------------- */
async function refreshList(gid, selectId = null) {
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

  // Do not auto-select or open. Respect explicit selectId if provided.
  if (selectId !== null) sel.value = canonicalId(selectId);
}

/* ----------------------------- open by id ------------------------------ */
let loadSeq = 0;

async function openById(gid, requestedId, seq = 0) {
  showBusy("Loading blueprint…");

  let bp = null;
  let graph = { nodes: [], edges: [] };
  const req = canonicalId(requestedId);

  try {
    await ensureNodesIndex();

    bp = await openBlueprint(gid, req);
    if (!bp) {
      stepLog(3, "Load blueprint", "FAIL", "provider returned null");
      hideBusy();
      return { ok: false, reason: "no-blueprint" };
    }

    const want = String(req).toLowerCase();
    const got = String(bp.id).toLowerCase();
    if (want !== got) {
      stepLog(3, "Load blueprint", "FAIL", `provider mismatch want=${want} got=${got}`);
      hideBusy();
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
    hideBusy();
    return { ok: false, reason: "exception" };
  }

  if (seq && seq !== loadSeq) {
    hideBusy();
    return { ok: false, reason: "superseded" };
  }

  try {
    state.bpId = bp.id;
    state.bpName = bp.name || bp.id;
    stepLog(4, "Update runtime state", "OK", `id=${state.bpId}`);
  } catch (e) {
    stepLog(4, "Update runtime state", "FAIL", e?.message || "exception");
    hideBusy();
    return { ok: false, reason: "state-failure" };
  }

  if (seq && seq !== loadSeq) {
    hideBusy();
    return { ok: false, reason: "superseded" };
  }

  let verify = { ok: false, details: "" };
  try {
    state.nodes?.clear?.();
    state.edges?.clear?.();
    renderAll();
    loadSnapshot(graph, () => renderAll());
    verify = verifyGraphRendered(graph);
    stepLog(5, "Render graph + VERIFY", verify.ok ? "OK" : "FAIL", verify.details);
  } catch (e) {
    stepLog(5, "Render graph + VERIFY", "FAIL", e?.message || "exception");
    hideBusy();
    return { ok: false, reason: "render-failure" };
  }

  hideBusy();
  return { ok: verify.ok, reason: verify.ok ? "ok" : "verify-failed" };
}

/* --------------------------- init + events ----------------------------- */
export async function initBlueprints(gid) {
  ensureBusyUI();

  const sel = els.bpSelect;
  const btnCreate = els.bpCreate;
  const btnRenameBtn = els.bpRename;
  const btnDeleteBtn = els.bpDelete;

  // Start on overlay. No auto-load.
  els.overlay.style.display = "";
  state.bpId = null; state.bpName = null;

  // External delete (from dock red bar).
  window.addEventListener("bp:delete-request", async (ev) => {
    if (BUSY) return;
    const targetId = String(ev?.detail?.id || "");
    if (!targetId) return;
    if (!confirm("Delete this blueprint?")) return;

    showBusy("Deleting…");
    try {
      await deleteBlueprint(gid, { id: targetId });

      if (state.bpId && String(state.bpId) === targetId) {
        state.bpId = null;
        state.bpName = null;
        state.nodes.clear();
        state.edges.clear();
        renderAll();
        els.overlay.style.display = "";
      }

      await refreshList(gid);
      els.bpSelect.value = "";
      window.dispatchEvent(new CustomEvent("bp:selected", { detail: { id: "" } }));
      clearDirty(els.dirty);
    } finally {
      hideBusy();
    }
  });

  // External rename (from dock right-click).
  window.addEventListener("bp:rename-request", async (ev) => {
    if (BUSY) return;
    const targetId = String(ev?.detail?.id || "");
    const newName = String(ev?.detail?.name || "").trim();
    if (!targetId || !newName) return;

    showBusy("Renaming…");
    try {
      await renameBlueprint(gid, { id: targetId, name: newName });
      if (state.bpId && String(state.bpId) === targetId) state.bpName = newName;
      await refreshList(gid, state.bpId || null);
    } finally {
      hideBusy();
    }
  });

  const btnSave =
    document.querySelector('[data-action="save"]') ||
    document.getElementById("bpSave") ||
    document.getElementById("saveBtn");
  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      if (BUSY || !state.bpId) return;
      await saveCurrentBlueprint(gid);
    });
  }

  sel?.addEventListener("change", async (e) => {
    if (!e.isTrusted || BUSY) return;
    const id = canonicalId(sel.value);
    if (!id) return;
    if (String(id) === String(state.bpId)) {
      stepLog(1, "Bubble event received", "OK", `id=${id} (already active; ignored)`);
      return;
    }
    const mySeq = ++loadSeq;
    const res = await openById(gid, id, mySeq);
    clearDirty(els.dirty);
    els.overlay.style.display = res.ok ? "none" : "";
    stepLog(7, "Finalize UI", res.ok ? "OK" : "FAIL", res.ok ? "overlay hidden" : "overlay shown");
  });

  window.addEventListener("bp:selected", async (ev) => {
    if (BUSY) return;
    const pickedRaw = String(ev?.detail?.id || "");
    const picked = canonicalId(pickedRaw);
    const same = picked && String(picked) === String(state.bpId);
    stepLog(
      1,
      "Bubble event received",
      picked ? "OK" : "FAIL",
      picked ? `id=${picked}${same ? " (already active; ignored)" : ""}` : "missing id"
    );
    if (!picked || same) return;

    if (els.bpSelect) els.bpSelect.value = picked;

    const mySeq = ++loadSeq;
    const res = await openById(gid, picked, mySeq);

    stepLog(6, "Notify legacy listeners", "SKIP");
    clearDirty(els.dirty);
    els.overlay.style.display = res.ok ? "none" : "";
    stepLog(7, "Finalize UI", res.ok ? "OK" : "FAIL", res.ok ? "overlay hidden" : "overlay shown");
  });

  btnCreate?.addEventListener("click", async () => {
    if (BUSY) return;
    const name = prompt("New blueprint name?")?.trim(); // spaces allowed
    if (!name) return;
    showBusy("Creating…");
    try {
      await createBlueprint(gid, { name });
      await refreshList(gid);              // no selectId -> no highlight
      els.bpSelect.value = "";             // explicit none
      window.dispatchEvent(new CustomEvent("bp:selected", { detail: { id: "" } }));
      els.overlay.style.display = "";      // stay on overlay
    } finally {
      hideBusy();
    }
  });

  btnRenameBtn?.addEventListener("click", async () => {
    if (BUSY || !state.bpId) return;
    const name = prompt("Rename blueprint to?", state.bpName)?.trim(); // spaces allowed
    if (!name) return;
    showBusy("Renaming…");
    try {
      await renameBlueprint(gid, { id: state.bpId, name });
      state.bpName = name;
      await refreshList(gid, state.bpId);
    } finally {
      hideBusy();
    }
  });

  btnDeleteBtn?.addEventListener("click", async () => {
    if (BUSY || !state.bpId) return;
    if (!confirm("Delete this blueprint?")) return;
    showBusy("Deleting…");
    try {
      await deleteBlueprint(gid, { id: state.bpId });
      state.bpId = null;
      state.bpName = null;
      state.nodes.clear();
      state.edges.clear();
      renderAll();
      els.overlay.style.display = "";
      await refreshList(gid, "");
      els.bpSelect.value = "";
      window.dispatchEvent(new CustomEvent("bp:selected", { detail: { id: "" } }));
      clearDirty(els.dirty);
    } finally {
      hideBusy();
    }
  });

  // Build list once. Do not auto-load or highlight.
  await refreshList(gid);
  els.bpSelect.value = "";
  window.dispatchEvent(new CustomEvent("bp:selected", { detail: { id: "" } }));
}

/* --------------------------------- save -------------------------------- */
export async function saveCurrentBlueprint(gid) {
  if (BUSY || !state.bpId) return false;
  const graph = JSON.parse(snapshot());
  const bp = { id: state.bpId, name: state.bpName, data: { graph, script: null } };
  showBusy("Saving…");
  try {
    const ok = await saveBlueprint(gid, bp);
    if (ok) clearDirty(els.dirty);
    return ok;
  } catch {
    return false;
  } finally {
    hideBusy();
  }
}
