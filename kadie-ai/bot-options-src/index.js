// bot-options-src/index.js — bootstrap Kadie AI editor

import { printDiagnostics } from '/assets/api.js';
import { gid, gname, gicon, total, online } from './config.js';
import { els, setGuildHeader } from './dom.js';
import { fitSvg, renderAll } from './render.js';
import { initInteractions } from './interactions.js';
import {
  initBlueprints,
  saveCurrentBlueprint,
  revertCurrentBlueprint,
} from './blueprints.js';
import { undo, redo } from './state.js';

printDiagnostics('bot-options.html');

setGuildHeader({ gid, gname, gicon, total, online });

fitSvg();
window.addEventListener('resize', fitSvg);

initInteractions();

(async () => {
  await initBlueprints(gid);
  renderAll();
})();

// toolbar
document.getElementById('undoBtn')?.addEventListener('click', () => undo(renderAll));
document.getElementById('redoBtn')?.addEventListener('click', () => redo(renderAll));
document.getElementById('saveBtn')?.addEventListener('click', async () => {
  await saveCurrentBlueprint();
});
document.getElementById('revertBtn')?.addEventListener('click', async () => {
  await revertCurrentBlueprint();
});

// expose for quick console debugging
window.__kadie = { els };
