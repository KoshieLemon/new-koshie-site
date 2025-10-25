// blueprints.ui.js
// UI wiring: events, external requests, initial list, and Discover import bridge.

import { els } from '../core/dom.js';
import { state, clearDirty, loadSnapshot } from '../core/state.js';
import { renderAll } from '../render/render.js';
import { createBlueprint, renameBlueprint, deleteBlueprint } from '../providers/providers.js';
import { ensureBusyUI, stepLog, showBusy, hideBusy, BUSY, nextLoadSeq } from './blueprints.ctx.js';
import { canonicalId, verifyGraphRendered } from './blueprints.util.js';
import { refreshList } from './blueprints.list.js';
import { openById } from './blueprints.open.js';
import { saveCurrentBlueprint } from './blueprints.save.js';
import { toast } from '../core/notify.js';

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

const IMPORT_KEY = 'kadie.discoverImport';
const nextFrame = () => new Promise(requestAnimationFrame);

async function importDraftFromSession(){
  const raw = sessionStorage.getItem(IMPORT_KEY);
  if (!raw) return false;

  let payload = null;
  try{ payload = JSON.parse(raw); }catch{ sessionStorage.removeItem(IMPORT_KEY); return false; }
  sessionStorage.removeItem(IMPORT_KEY);

  const name = String(payload?.name || payload?.id || 'Imported');
  const graph = payload?.graph && typeof payload.graph === 'object'
    ? { nodes: Array.isArray(payload.graph.nodes)?payload.graph.nodes:[], edges: Array.isArray(payload.graph.edges)?payload.graph.edges:[] }
    : { nodes: [], edges: [] };

  // Build a temporary, unsaved option so user can see and switch away if desired.
  const tempId = `import-${Date.now()}`;
  const opt = document.createElement('option');
  opt.value = tempId;
  opt.textContent = `${name} (import)`;
  els.bpSelect.prepend(opt);
  els.bpSelect.value = tempId;

  showBusy('Importing…');

  try{
    // Clear, paint, then load the imported graph WITHOUT saving.
    state.bpId = tempId;
    state.bpName = `${name} (import)`;

    state.nodes?.clear?.();
    state.edges?.clear?.();
    renderAll();
    await nextFrame();

    loadSnapshot(graph, () => renderAll());
    await nextFrame();

    const verify = verifyGraphRendered(graph);
    stepLog(5, 'Import graph + VERIFY', verify.ok ? 'OK' : 'FAIL', verify.details);
    els.overlay.style.display = verify.ok ? 'none' : '';
    clearDirty(els.dirty);
    if (!verify.ok) toast('Import loaded but verification failed.', { kind:'error' });
  } finally {
    hideBusy();
  }
  return true;
}

export async function initBlueprints(gid){
  ensureBusyUI();

  const sel = els.bpSelect;
  const btnCreate = els.bpCreate;
  const btnRenameBtn = els.bpRename;
  const btnDeleteBtn = els.bpDelete;

  els.overlay.style.display = '';
  state.bpId = null; state.bpName = null;

  window.addEventListener('bp:delete-request', async (ev)=>{
    if (BUSY) return;
    const targetId = String(ev?.detail?.id || '');
    if (!targetId) return;
    if (!confirm('Delete this blueprint?')) return;

    showBusy('Deleting…');
    try{
      await deleteBlueprint(gid, { id: targetId });

      if (state.bpId && String(state.bpId) === targetId){
        state.bpId = null;
        state.bpName = null;
        state.nodes.clear();
        state.edges.clear();
        renderAll();
        els.overlay.style.display = '';
      }

      await refreshList(gid);
      els.bpSelect.value = '';
      window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:'' } }));
      clearDirty(els.dirty);
    }finally{
      hideBusy();
    }
  });

  window.addEventListener('bp:rename-request', async (ev)=>{
    if (BUSY) return;
    const targetId = String(ev?.detail?.id || '');
    const newName  = String(ev?.detail?.name || '').trim();
    if (!targetId || !newName) return;

    showBusy('Renaming…');
    try{
      await renameBlueprint(gid, { id: targetId, name: newName });
      if (state.bpId && String(state.bpId) === targetId) state.bpName = newName;
      await refreshList(gid, state.bpId || null);
    }finally{
      hideBusy();
    }
  });

  const btnSave =
    document.querySelector('[data-action="save"]') ||
    document.getElementById('bpSave') ||
    document.getElementById('saveBtn');
  if (btnSave){
    btnSave.addEventListener('click', async ()=>{
      if (BUSY || !state.bpId) return;
      await saveCurrentBlueprint(gid);
    });
  }

  sel?.addEventListener('change', async (e)=>{
    if (!e.isTrusted || BUSY) return;
    const id = canonicalId(sel.value);
    if (!id) return;
    if (String(id) === String(state.bpId)){
      stepLog(1, 'Bubble event received', 'OK', `id=${id} (already active; ignored)`);
      return;
    }
    const mySeq = nextLoadSeq();
    const res = await openById(gid, id, mySeq);
    clearDirty(els.dirty);
    els.overlay.style.display = res.ok ? 'none' : '';
    stepLog(7, 'Finalize UI', res.ok ? 'OK' : 'FAIL', res.ok ? 'overlay hidden' : 'overlay shown');
  });

  window.addEventListener('bp:selected', async (ev)=>{
    if (BUSY) return;
    const pickedRaw = String(ev?.detail?.id || '');
    const picked = canonicalId(pickedRaw);
    const same = picked && String(picked) === String(state.bpId);
    stepLog(1, 'Bubble event received', picked ? 'OK' : 'FAIL',
      picked ? `id=${picked}${same ? ' (already active; ignored)' : ''}` : 'missing id');
    if (!picked || same) return;

    if (els.bpSelect) els.bpSelect.value = picked;

    const mySeq = nextLoadSeq();
    const res = await openById(gid, picked, mySeq);

    stepLog(6, 'Notify legacy listeners', 'SKIP');
    clearDirty(els.dirty);
    els.overlay.style.display = res.ok ? 'none' : '';
    stepLog(7, 'Finalize UI', res.ok ? 'OK' : 'FAIL', res.ok ? 'overlay hidden' : 'overlay shown');
  });

  btnCreate?.addEventListener('click', async ()=>{
    if (BUSY) return;
    const name = prompt('New blueprint name?')?.trim();
    if (!name) return;
    showBusy('Creating…');
    try{
      await createBlueprint(gid, { name });
      await refreshList(gid);
      els.bpSelect.value = '';
      window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:'' } }));
      els.overlay.style.display = '';
    } catch(e){
      const code = codeFromError(e);
      if (code === 'too_many_blueprints'){
        toast('Maximum blueprints reached (10). Delete one to create another.', { kind:'error' });
      } else {
        toast('Create failed.', { kind:'error' });
      }
    } finally{
      hideBusy();
    }
  });

  btnRenameBtn?.addEventListener('click', async ()=>{
    if (BUSY || !state.bpId) return;
    const name = prompt('Rename blueprint to?', state.bpName)?.trim();
    if (!name) return;
    showBusy('Renaming…');
    try{
      await renameBlueprint(gid, { id: state.bpId, name });
      state.bpName = name;
      await refreshList(gid, state.bpId);
    }finally{
      hideBusy();
    }
  });

  btnDeleteBtn?.addEventListener('click', async ()=>{
    if (BUSY || !state.bpId) return;
    if (!confirm('Delete this blueprint?')) return;
    showBusy('Deleting…');
    try{
      await deleteBlueprint(gid, { id: state.bpId });
      state.bpId = null;
      state.bpName = null;
      state.nodes.clear();
      state.edges.clear();
      renderAll();
      els.overlay.style.display = '';
      await refreshList(gid, '');
      els.bpSelect.value = '';
      window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:'' } }));
      clearDirty(els.dirty);
    }finally{
      hideBusy();
    }
  });

  // Discover page bridge: select by id if message arrives.
  window.addEventListener('message', async (ev) => {
    if (BUSY) return;
    const d = ev?.data;
    if (!d || d.type !== 'bp:select') return;
    const incoming = canonicalId(String(d.id || ''));
    if (!incoming) return;
    await refreshList(gid, incoming);
    window.dispatchEvent(new CustomEvent('bp:selected', { detail: { id: incoming } }));
    els.overlay.style.display = 'none';
  });

  // Initial list
  await refreshList(gid);
  els.bpSelect.value = '';
  window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:'' } }));

  // If Discover placed an import payload in sessionStorage, load it as an UNSAVED draft.
  await importDraftFromSession();
}
