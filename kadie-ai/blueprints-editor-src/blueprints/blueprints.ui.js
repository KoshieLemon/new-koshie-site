// blueprints.ui.js
// UI wiring: events, external requests, and initial list.

import { els } from '../core/dom.js';
import { state, clearDirty } from '../core/state.js';
import { renderAll } from '../render/render.js';
import { createBlueprint, renameBlueprint, deleteBlueprint } from '../providers/providers.js';
import { ensureBusyUI, stepLog, showBusy, hideBusy, BUSY, nextLoadSeq } from './blueprints.ctx.js';
import { canonicalId } from './blueprints.util.js';
import { refreshList } from './blueprints.list.js';
import { openById } from './blueprints.open.js';
import { saveCurrentBlueprint } from './blueprints.save.js';

const MAX_BLUEPRINTS = 10;

function countBlueprintsFromDOM(){
  try{
    const list = document.getElementById('bpList');
    if (!list) return 0;
    // Count chips that represent real blueprints (exclude the “add” affordance if present)
    return Array.from(list.querySelectorAll('.chip')).filter(el => !el.classList.contains('add')).length;
  }catch{ return 0 }
}

export async function initBlueprints(gid){
  ensureBusyUI();

  const sel = els.bpSelect;
  const btnCreate = els.bpCreate;
  const btnRenameBtn = els.bpRename;
  const btnDeleteBtn = els.bpDelete;

  // Start on overlay. No auto-load.
  els.overlay.style.display = '';
  state.bpId = null; state.bpName = null;

  // External delete
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

  // External rename
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

  // Save button (various selectors kept)
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

  // Select change
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

  // Programmatic selection
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

  // Create
  btnCreate?.addEventListener('click', async ()=>{
    if (BUSY) return;

    // Enforce max blueprints per guild
    const count = countBlueprintsFromDOM();
    if (count >= MAX_BLUEPRINTS){
      alert(`Limit reached: maximum ${MAX_BLUEPRINTS} blueprints per server.`);
      return;
    }

    const name = prompt('New blueprint name?')?.trim();
    if (!name) return;
    showBusy('Creating…');
    try{
      await createBlueprint(gid, { name });
      await refreshList(gid);
      els.bpSelect.value = '';
      window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:'' } }));
      els.overlay.style.display = '';
    }finally{
      hideBusy();
    }
  });

  // Rename
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

  // Delete
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

  // Initial list only
  await refreshList(gid);
  els.bpSelect.value = '';
  window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:'' } }));
}
