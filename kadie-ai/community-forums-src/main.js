import { bootAuth, renderFilterBar, renderTagPicker, bindComposer, renderBpChips, loadFeed } from './ui.js';

async function init(){
  await bootAuth();
  renderFilterBar();
  renderTagPicker();
  bindComposer();
  renderBpChips();
  await loadFeed(true);
}
init().catch(console.error);
