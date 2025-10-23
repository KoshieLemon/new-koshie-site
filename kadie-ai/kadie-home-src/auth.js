import { API_BASE } from './utils.js';
import { store } from './state.js';
import { ensureUserPillMounted, renderSignedIn, renderSignedOut, openMenu, setDot } from './auth-ui.js';
import { applyGateForTab } from './tabs.js';
import { OAUTH_URL, ME_URL, LOGOUT_URL, apiGet } from '../api.js';

const AUTH_CACHE_KEY = 'kadie.auth.cache.v1';

function readAuthCache(){
  try{ const raw = localStorage.getItem(AUTH_CACHE_KEY); return raw ? JSON.parse(raw) : null; }catch{return null;}
}
function writeAuthCache(user, profile, unread){
  try{ localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ user, profile, unread:Number(unread||0), ts:Date.now() })); }catch{}
}
function clearAuthCache(){ try{ localStorage.removeItem(AUTH_CACHE_KEY); }catch{} }

export function signOut(){
  try { sessionStorage.removeItem('kadie.return_to'); } catch {}
  clearAuthCache();
  const u = new URL(LOGOUT_URL);
  u.searchParams.set('return_to', location.href);
  location.href = u.toString();
}

async function getPostsByIds(ids){
  if (!ids?.length) return [];
  const r = await fetch(`${API_BASE}/forums/posts/byIds?ids=${encodeURIComponent(ids.join(','))}`, { credentials:'include' });
  if (!r.ok) return [];
  const j = await r.json().catch(()=>({items:[]})); return Array.isArray(j.items) ? j.items : [];
}
async function getNotifications(limit=50){
  const r = await fetch(`${API_BASE}/forums/notifications?limit=${limit}`, { credentials:'include' });
  if (!r.ok) return [];
  const j = await r.json().catch(()=>({items:[]})); return Array.isArray(j.items) ? j.items : [];
}
async function markNotificationsRead(){ await fetch(`${API_BASE}/forums/notifications/read`, { method:'POST', credentials:'include' }); }

export async function selectUserMenuTab(key, dropdown){
  if (!dropdown) return;
  dropdown.querySelectorAll('.km-tab').forEach(b => b.classList.remove('active'));
  const activeBtn = dropdown.querySelector(`.km-tab[data-tab="${key}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const body = document.getElementById('kmBody');
  body.innerHTML = '<div class="km-empty">Loading…</div>';

  if (key === 'liked' || key === 'bookmarked') {
    const ids = (key === 'liked' ? (store.userState.profile?.likedPostIds || []) : (store.userState.profile?.bookmarkedPostIds || []));
    const posts = await getPostsByIds(ids.slice(-50).reverse());
    if (!posts.length) { body.innerHTML = '<div class="km-empty">None yet.</div>'; return; }
    body.innerHTML = '';
    posts.forEach(p => {
      const d = document.createElement('div'); d.className = 'km-item';
      d.innerHTML = `
        <div>${(p.content || '').toString().slice(0, 140)}</div>
        <div class="km-meta">by ${p.authorName || 'user'} • ${new Date(p.createdAt||Date.now()).toLocaleString()}</div>
        <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end">
          <button class="btn" data-thread="${p.threadId}">Open</button>
        </div>`;
      d.querySelector('.btn').onclick = (e) => {
        e.stopPropagation();
        const btn = document.getElementById('tab-community');
        if (btn) btn.hidden = false;
        document.getElementById('tab-community')?.click();
      };
      body.appendChild(d);
    });
    return;
  }

  if (key === 'notifications') {
    const items = await getNotifications(50);
    body.innerHTML = '';
    if (!items.length) { body.innerHTML = '<div class="km-empty">No notifications.</div>'; }
    items.forEach(n => {
      const d = document.createElement('div'); d.className = 'km-item';
      d.innerHTML = `
        <div>${n.message || '(notification)'}</div>
        <div class="km-meta">${new Date(n.createdAt||Date.now()).toLocaleString()}</div>`;
      body.appendChild(d);
    });
    await markNotificationsRead().catch(()=>{});
    setDot(false);
  }
}

export function preloadAuthFromCache(){
  const c = readAuthCache();
  if (!c) return false;
  try{
    const slot = ensureUserPillMounted();
    renderSignedIn(slot, c.user, () => openMenu(slot, selectUserMenuTab, null, null, null), signOut);
    store.userState.user = c.user;
    store.userState.profile = c.profile || null;
    store.userState.unread = Number(c.unread || 0);
    setDot(store.userState.unread > 0);
    store.isAuthed = true;
    const btn = document.getElementById('tab-community'); if (btn) btn.hidden = false;
    return true;
  }catch{ return false; }
}

export async function verifyAuthRefresh(){
  const userSlot = ensureUserPillMounted();
  try{
    const res = await apiGet(ME_URL, 'GET /me (kadie-home)');
    store.authUnknown = false;

    if (res.ok){
      const data = await res.json().catch(()=>null);
      const user = data?.user || null;
      store.isAuthed = true;
      const cbtn = document.getElementById('tab-community'); if (cbtn) cbtn.hidden = false;
      document.getElementById('authStatus').textContent = 'Signed in.';
      renderSignedIn(userSlot, user, () => openMenu(userSlot, selectUserMenuTab, null, null, null), signOut);
      store.userState.user = user;

      const summary = await fetch(`${API_BASE}/forums/me`, { credentials:'include' }).then(r=>r.json()).catch(()=>({profile:null, unreadCount:0}));
      store.userState.profile = summary.profile;
      store.userState.unread = Number(summary.unreadCount || 0);
      setDot(store.userState.unread > 0);

      writeAuthCache(store.userState.user, store.userState.profile, store.userState.unread);
      applyGateForTab(store.currentTab);
    } else {
      store.isAuthed = false;
      const cbtn = document.getElementById('tab-community'); if (cbtn) cbtn.hidden = true;
      store.userState = { user:null, profile:null, unread:0 };
      setDot(false);
      clearAuthCache();
      renderSignedOut(userSlot, OAUTH_URL);
      applyGateForTab(store.currentTab);
    }
  } catch {
    store.authUnknown = false;
    if (!store.isAuthed) {
      const cbtn = document.getElementById('tab-community'); if (cbtn) cbtn.hidden = true;
      const slot = ensureUserPillMounted();
      renderSignedOut(slot, OAUTH_URL);
      setDot(false);
    }
    applyGateForTab(store.currentTab);
  }
}
