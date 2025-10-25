// kadie-home-src/auth-ui.js
import { byId } from './utils.js';
import { store } from './state.js';

const headerEl = byId('siteHeader');

function ensureUserStyles(){
  if (byId('kadie-userpill-style')) return;
  const style = document.createElement('style');
  style.id = 'kadie-userpill-style';
  style.textContent = `
    #kadieUser { margin-left:auto; display:flex; align-items:center; gap:8px; position:relative; }
    .kadie-userwrap{ display:flex; align-items:center; gap:10px; cursor:pointer; position:relative; }
    .kadie-avatar{ width:28px; height:28px; border-radius:999px; object-fit:cover;
                   background:#0e1218; border:1px solid #1f2432; }
    .kadie-dot{ position:absolute; right:-2px; top:-2px; width:10px; height:10px; border-radius:50%;
                background:#ff8a00; border:2px solid #0b0b0c; display:none; }
    .kadie-dot.show{ display:block; }

    .btn{border:1px solid #2b2f3a;background:#11131a;color:#eaeaea;padding:7px 10px;border-radius:10px;cursor:pointer;text-decoration:none;font-size:13px; display:inline-flex; align-items:center}
    .btn.danger{border-color:#5f1a20;background:#2a0e12;color:#ffd7d7}
    .btn.danger:hover{background:#47141b}

    /* User menu portal (kept but you disabled avatar clicks elsewhere) */
    .k-portal{ position:fixed; inset:0; z-index:2147483647; display:none; }
    .k-portal.show{ display:block; }
    .k-backdrop{ position:absolute; inset:0; background:transparent; }

    .kadie-menu{ position:absolute; width:360px; max-width:min(360px, 96vw); max-height:70vh; overflow:auto;
                 background:#0e1116; border:1px solid #2b2f3a; border-radius:12px; display:block; z-index:1;
                 box-shadow:0 12px 24px #000a; }
    .km-head{ display:flex; gap:6px; padding:8px; border-bottom:1px solid #1a1f2b; position:sticky; top:0; background:#0e1116; }
    .km-tab{ flex:1; padding:8px; border:1px solid #2b2f3a; background:#11131a; color:#eaeaea; border-radius:8px; cursor:pointer; text-align:center; }
    .km-tab.active{ outline:2px solid #5ac8fa; }
    .km-body{ padding:8px; display:flex; flex-direction:column; gap:8px; }
    .km-item{ border:1px solid #1f2635; background:#0c1018; border-radius:10px; padding:8px; }
    .km-meta{ font-size:12px; color:#9aa4b2; margin-top:4px }
    .km-empty{ color:#9aa4b2; text-align:center; padding:16px }
  `;
  document.head.appendChild(style);
}
function headerInner(){ return headerEl.querySelector('.header') || headerEl; }
function ensureUserPill(){
  ensureUserStyles();
  let el = byId('kadieUser');
  if (!el) { el = document.createElement('div'); el.id = 'kadieUser'; headerInner().appendChild(el); }
  return el;
}
export const avatarUrl = (u) => (u?.sub && u?.avatar) ? `https://cdn.discordapp.com/avatars/${u.sub}/${u.avatar}.png?size=64` : null;

let portalRoot = null, dropdown = null, dot = null;

function getPortal(){
  let p = document.getElementById('kadieUserMenuPortal');
  if (!p) {
    p = document.createElement('div');
    p.id = 'kadieUserMenuPortal';
    p.className = 'k-portal';
    document.body.appendChild(p);
  }
  return p;
}
export function closeMenu(){
  if (!portalRoot) return;
  portalRoot.classList.remove('show');
  portalRoot.innerHTML = '';
}
export function openMenu(anchorEl, selectTabFn, getPostsByIds, getNotifications, markNotificationsRead){
  portalRoot = getPortal();
  portalRoot.innerHTML = '';
  const backdrop = document.createElement('div'); backdrop.className = 'k-backdrop';
  backdrop.addEventListener('click', closeMenu);
  portalRoot.appendChild(backdrop);

  dropdown = document.createElement('div'); dropdown.className = 'kadie-menu'; dropdown.id = 'kadieUserMenu';
  dropdown.innerHTML = `
    <div class="km-head">
      <button class="km-tab" data-tab="liked">Liked</button>
      <button class="km-tab" data-tab="bookmarked">Bookmarked</button>
      <button class="km-tab" data-tab="notifications">Notifications</button>
    </div>
    <div class="km-body" id="kmBody"><div class="km-empty">Select a tab.</div></div>
  `;
  dropdown.addEventListener('click', e => e.stopPropagation());
  portalRoot.appendChild(dropdown);

  const r = anchorEl.getBoundingClientRect();
  const gap = 8;
  const top = Math.min(window.innerHeight - 24, r.bottom + gap);
  const left = Math.min(Math.max(8, r.right - 360), window.innerWidth - 12 - 360);
  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;

  dropdown.querySelectorAll('.km-tab').forEach(btn=>{
    btn.addEventListener('click', ()=> selectTabFn(btn.dataset.tab, dropdown, getPostsByIds, getNotifications, markNotificationsRead));
  });

  const onKey = (e)=>{ if (e.key === 'Escape') { closeMenu(); window.removeEventListener('keydown', onKey); } };
  window.addEventListener('keydown', onKey);

  portalRoot.classList.add('show');
  selectTabFn('notifications', dropdown, getPostsByIds, getNotifications, markNotificationsRead);
}

export function renderSignedOut(container, oauthUrl){
  container.innerHTML = '';
  const a = document.createElement('a'); a.href = oauthUrl; a.className = 'btn'; a.textContent = 'Sign in';
  a.setAttribute('data-auth','signin');
  container.appendChild(a);
}

export function renderSignedIn(container, user, openMenuHandler, signOut){
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'kadie-userwrap';
  wrap.setAttribute('role','button');
  wrap.setAttribute('tabindex','0');

  const img = document.createElement('img');
  img.className = 'kadie-avatar';
  img.alt = user?.username || 'profile';
  const url = avatarUrl(user); if (url) img.src = url;

  dot = document.createElement('span'); dot.className = 'kadie-dot'; dot.id = 'kadieNotifDot';

  wrap.appendChild(img); wrap.appendChild(dot);
  container.appendChild(wrap);

  // Always render a visible Sign out button beside the avatar
  const signout = document.createElement('button');
  signout.className = 'btn danger';
  signout.id = 'signOutBtn';
  signout.setAttribute('data-auth','signout');
  signout.textContent = 'Sign out';
  signout.addEventListener('click', signOut);
  container.appendChild(signout);

  // You disabled the dropdown elsewhere. Keep handlers for completeness.
  wrap.onclick = openMenuHandler;
  wrap.onkeydown = (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenuHandler(); } };
}

export function ensureUserPillMounted(){ return ensureUserPill(); }
export function setDot(on){ const el = document.getElementById('kadieNotifDot') || dot; if (!el) return; el.classList.toggle('show', !!on); }
