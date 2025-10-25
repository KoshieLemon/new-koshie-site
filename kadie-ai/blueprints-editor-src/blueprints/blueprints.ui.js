// blueprints.ui.js
// Instant switching via cache. Universal Save/Revert. No suffixes in names.

import { els } from '../core/dom.js';
import { state, clearDirty, loadSnapshot, snapshot } from '../core/state.js';
import { renderAll } from '../render/render.js';
import { createBlueprint, renameBlueprint, deleteBlueprint } from '../providers/providers.js';
import { ensureBusyUI, stepLog, showBusy, hideBusy, BUSY, nextLoadSeq } from './blueprints.ctx.js';
import { canonicalId, verifyGraphRendered } from './blueprints.util.js';
import { refreshList } from './blueprints.list.js';
import { openById } from './blueprints.open.js';
import { saveCurrentBlueprint } from './blueprints.save.js';
import { toast } from '../core/notify.js';
import { Cache } from './blueprints.cache.js';

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

  const tempId = `import-${Date.now()}`;
  Cache.put(tempId, { name, graph, exists: false });

  // Option label is exact name. No suffixes.
  const opt = document.createElement('option');
  opt.value = tempId;
  opt.textContent = name;
  els.bpSelect.prepend(opt);
  els.bpSelect.value = tempId;

  const res = await openById(state.gid, tempId, nextLoadSeq());
  clearDirty(els.dirty);
  els.overlay.style.display = res.ok ? 'none' : '';
  return true;
}

export async function initBlueprints(gid){
  ensureBusyUI();

  const sel = els.bpSelect;
  const btnCreate = els.bpCreate;
  const btnRenameBtn = els.bpRename;
  const btnDeleteBtn = els.bpDelete;

  els.overlay.style.display = '';
  state.bpId = null; state.bpName = null; state.gid = gid;

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
      Cache.rename(targetId, newName);
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

  const btnRevert =
    document.querySelector('[data-action="revert"]') ||
    document.getElementById('bpRevert') ||
    document.getElementById('revertBtn');
  if (btnRevert){
    btnRevert.addEventListener('click', async ()=>{
      if (BUSY || !state.bpId) return;
      const entry = Cache.get(state.bpId);
      if (!entry) return;
      const base = entry.baseline || { nodes: [], edges: [] };

      showBusy('Reverting…');
      try{
        try { Cache.updateGraph(state.bpId, JSON.parse(snapshot())); } catch {}
        loadSnapshot(base, () => renderAll());
        await nextFrame();
        clearDirty(els.dirty);
        els.overlay.style.display = 'none';
        stepLog(7, 'Revert baseline', 'OK', `id=${state.bpId}`);
      } finally {
        hideBusy();
      }
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
      const created = await createBlueprint(gid, { name });
      Cache.put(created.id, { name: created.name, graph: { nodes: [], edges: [] }, exists: true });
      await refreshList(gid, created.id);
      els.bpSelect.value = created.id;
      window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id: created.id } }));
      els.overlay.style.display = 'none';
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
      Cache.rename(state.bpId, name);
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

  await refreshList(gid);
  els.bpSelect.value = '';
  window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:'' } }));

  await importDraftFromSession();
}
