// index.js — boot the editor
import { renderAll, fitSvg } from './render.js';
import { initInteractions } from './interactions.js';
import { state } from './state.js';
import { els } from './dom.js';
import { loadNodesIndex } from './nodes-index.js';
import { loadBlueprintsForGuild, saveCurrentBlueprint } from './blueprints.js'; // keep your existing exports

async function boot(){
  await loadNodesIndex();     // populates state.nodesIndex
  await loadBlueprintsForGuild(); // populates state.nodes/edges for selected BP if any
  initInteractions();
  renderAll();
  window.addEventListener('resize', fitSvg);

  // bind save button if present
  document.getElementById('save')?.addEventListener('click', async ()=>{
    await saveCurrentBlueprint();
  });
}

boot();
