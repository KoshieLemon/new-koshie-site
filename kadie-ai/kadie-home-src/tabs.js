import { byId } from './utils.js';
import { store } from './state.js';

const tabs = {
  simple:     { btn: byId('tab-simple'),     frame: byId('frame-simple') },
  community:  { btn: byId('tab-community'),  frame: byId('frame-community') },
  blueprints: { btn: byId('tab-blueprints'), frame: byId('frame-blueprints') },
  nodes:      { btn: byId('tab-nodes'),      frame: byId('frame-nodes') },
  tutorials:  { btn: byId('tab-tutorials'),  frame: byId('frame-tutorials') },
  status:     { btn: byId('tab-status'),     frame: byId('frame-status') },
};
const authBlock  = byId('authBlock');
const authStatus = byId('authStatus');
const signinBtn  = byId('signinDirect');

const PUBLIC_TABS = new Set(['nodes','tutorials','status']);

export function getTabs(){ return tabs; }

export function isPublicTab(key){ return PUBLIC_TABS.has(key); }

export function applyGateForTab(key){
  if (store.isAuthed || isPublicTab(key)) {
    authBlock.classList.remove('show');
    return;
  }
  authStatus.textContent = store.authUnknown ? 'Checking session…' : 'Please sign in to access this section.';
  signinBtn.style.display = store.authUnknown ? 'none' : 'inline-block';
  authBlock.classList.add('show');
}

export function showTab(key){
  if (!tabs[key]) return;
  store.currentTab = key;
  for (const t of Object.values(tabs)) {
    if (t.btn)   t.btn.classList.remove('active');
    if (t.frame) t.frame.classList.remove('active');
  }
  const target = tabs[key];
  if (target.btn)   target.btn.classList.add('active');
  if (target.frame) target.frame.classList.add('active');
  applyGateForTab(key);
}

export function wireTabClicks(){
  Object.entries(tabs).forEach(([key, { btn }]) => btn && btn.addEventListener('click', () => showTab(key)));
}
