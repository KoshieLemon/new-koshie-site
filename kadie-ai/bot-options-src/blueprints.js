import { els } from './dom.js';
import { state, snapshot, loadSnapshot, clearDirty, markDirty } from './state.js';
import { renderAll } from './render.js';
import { listBlueprintsSafe, saveBlueprintSafe, deleteBlueprintSafe } from './providers.js';

async function refreshBlueprints(gid){
  const list = await listBlueprintsSafe(gid) || [];
  els.bpSelect.innerHTML = '';
  if (list.length===0){
    const opt = document.createElement('option'); opt.value=''; opt.textContent='(no blueprints)';
    els.bpSelect.appendChild(opt);
    els.overlay.style.display='flex';
  } else {
    for (const b of list){
      const opt = document.createElement('option'); opt.value=b.id; opt.textContent=b.name || b.id;
      els.bpSelect.appendChild(opt);
    }
    els.overlay.style.display='none';
  }
  return list;
}

async function openBlueprint(gid, id){
  const list = await listBlueprintsSafe(gid) || [];
  const bp = list.find(x=>x.id===id);
  if (!bp){ els.overlay.style.display='flex'; return; }
  state.currentBlueprint = { id: bp.id, name: bp.name };
  loadSnapshot(bp.data || { nodes:[], edges:[] }, renderAll);
  clearDirty(els.dirty);
  [...els.bpSelect.options].forEach(o=>{ if (o.value===id) o.selected=true; });
  els.overlay.style.display='none';
}

export async function initBlueprints(gid){
  els.bpSelect.addEventListener('change', async ()=>{
    const id = els.bpSelect.value;
    if (!id){ els.overlay.style.display='flex'; return; }
    await openBlueprint(gid, id);
  });
  els.bpCreate.addEventListener('click', async ()=>{
    const name = prompt('Name this blueprint:');
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || `bp-${Date.now()}`;
    const bp = { id, name, data:{ nodes:[], edges:[] } };
    await saveBlueprintSafe(gid, bp);
    await refreshBlueprints(gid);
    await openBlueprint(gid, id);
  });
  els.bpRename.addEventListener('click', async ()=>{
    if (!state.currentBlueprint) return;
    const name = prompt('New name:', state.currentBlueprint.name);
    if (!name) return;
    const bp = { id: state.currentBlueprint.id, name, data: JSON.parse(snapshot()) };
    await saveBlueprintSafe(gid, bp);
    await refreshBlueprints(gid);
    await openBlueprint(gid, bp.id);
  });
  els.bpDelete.addEventListener('click', async ()=>{
    if (!state.currentBlueprint) return;
    if (!confirm('Delete this blueprint?')) return;
    await deleteBlueprintSafe(gid, state.currentBlueprint.id);
    state.currentBlueprint = null;
    await refreshBlueprints(gid);
    els.overlay.style.display='flex';
    els.nodesLayer.innerHTML=''; els.wiresSvg.innerHTML='';
    state.nodes.clear(); state.edges.clear(); state.sel.clear();
    clearDirty(els.dirty);
  });
  els.saveBtn.addEventListener('click', async ()=>{
    if (!state.currentBlueprint) return;
    const bp = { id: state.currentBlueprint.id, name: state.currentBlueprint.name, data: JSON.parse(snapshot()) };
    const ok = await saveBlueprintSafe(gid, bp);
    if (ok) clearDirty(els.dirty);
  });
  els.revertBtn.addEventListener('click', async ()=>{
    if (!state.currentBlueprint) return;
    await openBlueprint(gid, state.currentBlueprint.id);
    clearDirty(els.dirty);
  });

  const list = await refreshBlueprints(gid);
  if (list.length>0 && els.bpSelect.value) await openBlueprint(gid, els.bpSelect.value);
  else els.overlay.style.display='flex';
}
