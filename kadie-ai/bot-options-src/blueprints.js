// load/save list + active blueprint
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

// ---------- UI wiring ----------
async function refreshList(gid, selectId = "") {
  await ensureNodesIndex(); // make sure NODE_DEFS exists before rendering any node
  const list = await listBlueprints(gid);
  const sel = els.bpSelect;
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

async function openById(gid, id) {
  const bp = await openBlueprint(gid, id);
  if (!bp) {
    els.overlay.style.display = "";
    return;
  }
  state.bpId = bp.id;
  state.bpName = bp.name || bp.id;

  // bp.data may be {graph,script} or a plain graph; normalize to {nodes,edges}
  const graph = bp.data?.graph ?? bp.data ?? { nodes: [], edges: [] };
  loadSnapshot(graph, renderAll);
  clearDirty(els.dirty);
  els.overlay.style.display = "none";
}

export async function initBlueprints(gid) {
  const sel = els.bpSelect;
  const btnCreate = els.bpCreate;
  const btnRename = els.bpRename;
  const btnDelete = els.bpDelete;

  // Wire Save button(s) and Ctrl+S
  const btnSave =
    document.querySelector('[data-action="save"]') ||
    document.getElementById('bpSave') ||
    document.getElementById('saveBtn');

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      await saveCurrentBlueprint(gid);
    });
  }
  window.addEventListener("keydown", async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      await saveCurrentBlueprint(gid);
    }
  });

  sel?.addEventListener("change", async () => {
    const id = sel.value;
    if (!id) return (els.overlay.style.display = "");
    await openById(gid, id);
  });

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

export async function saveCurrentBlueprint(gid) {
  if (!state.bpId) return false;

  // Snapshot is the visual graph; separate execution script stays in memory if present
  const graph = JSON.parse(snapshot());
  const bp = { id: state.bpId, name: state.bpName, data: { graph, script: null } };

  try {
    const ok = await saveBlueprint(gid, bp);
    if (ok) clearDirty(els.dirty);
    console.log("[blueprints] saved", bp.id);
    return ok;
  } catch (e) {
    console.error("[blueprints] save failed", e);
    return false;
  }
}
