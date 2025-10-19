import { bootAuth, renderFilterBar, renderTagPicker, bindComposer, renderBpChips, loadFeed, loadTopBlueprintSidebar } from './ui.js';

async function init(){
  await bootAuth();
  renderFilterBar();
  renderTagPicker();
  bindComposer();
  renderBpChips();
  await loadFeed(true);
  await loadTopBlueprintSidebar();
}
init().catch(console.error);
