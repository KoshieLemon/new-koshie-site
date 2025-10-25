import { byId } from './utils.js';
import { store } from './state.js';

const tabs = {
  simple:     { btn: byId('tab-simple'),     frame: byId('frame-simple') },
  blueprints: { btn: byId('tab-blueprints'), frame: byId('frame-blueprints') },
  samples:    { btn: byId('tab-samples'),    frame: byId('frame-samples') },
  forums:     { btn: byId('tab-forums'),     frame: byId('frame-forums') },
  nodes:      { btn: byId('tab-nodes'),      frame: byId('frame-nodes') },
  status:     { btn: byId('tab-status'),     frame: byId('frame-status') },
  // keep tutorials here if your site uses it:
  // tutorials:  { btn: byId('tab-tutorials'),  frame: byId('frame-tutorials') },
};

const authBlock  = byId('authBlock');
const authStatus = byId('authStatus');
const signinBtn  = byId('signinDirect');

// Public tabs that do not require auth to view
const PUBLIC_TABS = new Set(['nodes','status','samples','forums']);

export function getTabs(){ return tabs; }
export function isPublicTab(key){ return PUBLIC_TABS.has(key); }

export function applyGateForTab(key){
  if (store.isAuthed || isPublicTab(key)) {
    authBlock?.classList.remove('show');
    return;
  }
  if (authStatus) authStatus.textContent = store.authUnknown ? 'Checking session…' : 'Please sign in to access this section.';
  if (signinBtn)  signinBtn.style.display = store.authUnknown ? 'none' : 'inline-block';
  authBlock?.classList.add('show');
}

export function showTab(key){
  if (!tabs[key]) return;
  store.currentTab = key;

  for (const t of Object.values(tabs)) {
    t.btn?.classList.remove('active');
    t.frame?.classList.remove('active');
  }

  const target = tabs[key];
  target.btn?.classList.add('active');
  target.frame?.classList.add('active');

  applyGateForTab(key);
}

export function wireTabClicks(){
  Object.entries(tabs).forEach(([key, { btn }]) => {
    if (btn) btn.addEventListener('click', () => showTab(key));
  });
}
