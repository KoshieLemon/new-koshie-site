// /kadie-ai/blueprints-editor-src/menu-manager.js
// Central manager to ensure only one menu is open at a time.

let activeId = null;
const registry = new Map(); // id -> hideFn

function safeHide(fn){ try{ fn && fn(); }catch{} }

export function requestOpen(id, hideFn){
  registry.set(id, hideFn);
  for (const [mid, fn] of registry){
    if (mid !== id) safeHide(fn);
  }
  activeId = id;
}

export function notifyClosed(id){
  if (activeId === id) activeId = null;
}

export function hideAllMenus(){
  for (const [, fn] of registry) safeHide(fn);
  activeId = null;
}

export function isMenuOpen(id){ return activeId === id; }
