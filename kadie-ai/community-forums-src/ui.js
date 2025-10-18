import { TAGS, DEFAULT_TAG } from './config.js';
import {
  urls, getSession, cdnAvatar, fetchFeed, createRootPost,
  toggleLike, toggleBookmark, listThreadPosts, createReply,
  getManageableGuilds, listBlueprints, createBlueprint
} from './api-client.js';

const $ = (s)=>document.querySelector(s);
const feedEl = $('#feed');
const postBtn = $('#postBtn');
const signinLink = $('#signinLink');
const composeBody = $('#composeBody');
const meAvatar = $('#meAvatar');
const tagSelect = $('#tagSelect');
const filterBar = $('#filterBar');
const moreBtn = $('#moreBtn');

export const state = {
  session: null,
  sort: 'popular',    // For You = popular, tag = recent
  cursor: null,
  activeTag: null,    // null => For You
  selectedTag: null,
  pendingBps: []
};

/* blueprint token helpers */
const bpToken = (g,bpId,name,server)=>`[bp:${g}:${bpId}:${encodeURIComponent(name)}:${encodeURIComponent(server)}]`;
const bpRe = /\[bp:([^:\]]+):([^:\]]+):([^:\]]*):([^\]]*)\]/g;
const extractBpTokens = (text)=>{ const out=[]; String(text||'').replace(bpRe,(_m,g,b,n,s)=>{ out.push({guildId:g,blueprintId:b,name:decodeURIComponent(n||''),serverName:decodeURIComponent(s||'')}); return '';}); return out; };
const stripBpTokens = (t)=>String(t||'').replace(bpRe,'').trim();

/* auth */
export async function bootAuth(){
  state.session = await getSession().catch(()=>null);
  if (!state.session) {
    postBtn.disabled = true;
    signinLink.href = urls.OAUTH_URL; signinLink.hidden = false;
    meAvatar.src = `https://cdn.discordapp.com/embed/avatars/1.png`;
  } else {
    signinLink.hidden = true;
    meAvatar.src = cdnAvatar(state.session.sub, state.session.avatar);
    validateReady();
  }
}

/* composer tag picker */
export function renderTagPicker(){
  tagSelect.innerHTML = '';
  TAGS.forEach(tag => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = tag;
    b.onclick = () => {
      state.selectedTag = tag;
      [...tagSelect.children].forEach(x=>x.classList.remove('primary'));
      b.classList.add('primary');
      validateReady();
    };
    tagSelect.appendChild(b);
  });
}

/* centered filter bar */
export function renderFilterBar(){
  filterBar.innerHTML = '';
  const make = (label, onClick, isActive=false) => {
    const el = document.createElement('button');
    el.className = 'filter-btn' + (isActive ? ' active' : '');
    el.textContent = label;
    el.onclick = onClick;
    return el;
  };
  filterBar.appendChild(make('For You', async () => {
    state.activeTag = null;
    state.sort = 'popular';
    state.cursor = null;
    feedEl.innerHTML = '';
    await loadFeed(true);
    renderFilterBar();
  }, state.activeTag === null));

  TAGS.forEach(tag => {
    const btn = make(tag, async () => {
      state.activeTag = tag;
      state.sort = 'recent';
      state.cursor = null;
      feedEl.innerHTML = '';
      await loadFeed(true);
      renderFilterBar();
    }, state.activeTag === tag);
    filterBar.appendChild(btn);
  });
}

/* composer */
export function bindComposer(){
  composeBody.addEventListener('input', validateReady);
  $('#attachBp').onclick = openPicker;
  postBtn.onclick = submitPost;
}
function validateReady(){
  const hasText = (composeBody.value || '').trim().length > 0;
  postBtn.disabled = !(state.session && (hasText || state.pendingBps.length>0));
}
async function submitPost(){
  if (!state.session) { location.href = urls.OAUTH_URL; return; }
  const base = composeBody.value.trim();
  if (!base && !state.pendingBps.length) return;
  let content = base;
  state.pendingBps.forEach(b => content += `\n${bpToken(b.guildId,b.blueprintId,b.name,b.serverName)}`);
  const tag = state.selectedTag || DEFAULT_TAG;
  await createRootPost({ content, tag }).catch(()=>{ alert('Failed to post'); });
  composeBody.value = '';
  state.pendingBps.length = 0;
  renderBpChips();
  state.cursor = null; feedEl.innerHTML=''; await loadFeed(true);
}

/* feed */
export async function loadFeed(reset=false){
  if (reset) state.cursor = null;
  const j = await fetchFeed({ sort: state.sort, cursor: state.cursor, tag: state.activeTag });
  const items = (j.items||[]).filter(p => !state.activeTag || String(p.tag || DEFAULT_TAG) === state.activeTag);
  items.forEach(p => {
    feedEl.appendChild(renderPost(p));
    loadReplies(p.threadId);
  });
  state.cursor = j.nextCursor || null;
  moreBtn.hidden = !state.cursor;
}

/* chips */
export function renderBpChips(){
  const chips = $('#chips'); chips.innerHTML = '';
  state.pendingBps.forEach((b,i)=>{
    const c=document.createElement('div'); c.className='chip';
    c.innerHTML=`📦 ${b.name} <span class="muted">(${b.serverName||b.guildId})</span> <button class="btn" style="padding:2px 8px">Remove</button>`;
    c.querySelector('button').onclick=()=>{ state.pendingBps.splice(i,1); renderBpChips(); validateReady(); };
    chips.appendChild(c);
  });
}

/* post + replies */
function renderPost(p){
  const li=document.createElement("div"); li.className="post";

  const tagBar=document.createElement('div');
  tagBar.style.display='flex'; tagBar.style.justifyContent='space-between'; tagBar.style.alignItems='center'; tagBar.style.marginBottom='4px';
  tagBar.innerHTML = `<span class="tag">${p.tag || DEFAULT_TAG}</span>`;
  li.appendChild(tagBar);

  const hdr=document.createElement("div"); hdr.className="phead";
  hdr.innerHTML = `
    <img class="avatar" src="${cdnAvatar(p.authorId,p.authorAvatar)}" alt="">
    <span>${p.authorName||"unknown"}</span>
    <span class="muted" style="margin-left:6px;">${new Date(p.createdAt).toLocaleString()}</span>`;
  li.appendChild(hdr);

  const tokens = extractBpTokens(p.content);
  const content = stripBpTokens(p.content);
  if(content){ const c=document.createElement("div"); c.className="pcontent"; c.textContent=content; li.appendChild(c); }
  tokens.forEach(b=> li.appendChild(makeBpCard(b)));

  const acts=document.createElement("div"); acts.className="pacts";
  acts.innerHTML = `
    <button class="icon-btn act-like" data-id="${p.id}" aria-pressed="false" title="Like">♥ <span class="count">${p.likesCount||0}</span></button>
    <button class="icon-btn act-bookmark" data-id="${p.id}" aria-pressed="false" title="Bookmark">★ <span class="count">${p.bookmarksCount||0}</span></button>`;
  li.appendChild(acts);

  const likeBtn = li.querySelector(".act-like");
  likeBtn.onclick = async () => {
    if(!state.session){ location.href=urls.OAUTH_URL; return; }
    const on = likeBtn.getAttribute("aria-pressed") !== "true";
    likeBtn.disabled = true;
    likeBtn.setAttribute("aria-pressed", on ? "true" : "false");
    bumpCount(likeBtn, on ? +1 : -1);
    const ok = await toggleLike(p.id, on).catch(()=>false);
    if(!ok){ likeBtn.setAttribute("aria-pressed", on ? "false" : "true"); bumpCount(likeBtn, on ? -1 : +1); }
    likeBtn.disabled = false;
  };

  const bmBtn = li.querySelector(".act-bookmark");
  bmBtn.onclick = async () => {
    if(!state.session){ location.href=urls.OAUTH_URL; return; }
    const on = bmBtn.getAttribute("aria-pressed") !== "true";
    bmBtn.disabled = true;
    bmBtn.setAttribute("aria-pressed", on ? "true" : "false");
    bumpCount(bmBtn, on ? +1 : -1);
    const ok = await toggleBookmark(p.id, on).catch(()=>false);
    if(!ok){ bmBtn.setAttribute("aria-pressed", on ? "false" : "true"); bumpCount(bmBtn, on ? -1 : +1); }
    bmBtn.disabled = false;
  };

  const reps=document.createElement("div"); reps.className="replies";
  reps.innerHTML = `
    <div class="reply-list" id="replylist_${p.threadId}"></div>
    <div class="reply">
      <img class="avatar" src="${state.session? cdnAvatar(state.session.sub, state.session.avatar) : 'https://cdn.discordapp.com/embed/avatars/1.png'}" alt="">
      <textarea class="textarea rp-text" placeholder="Write a reply…"></textarea>
      <button class="btn" style="white-space:nowrap" data-thread="${p.threadId}" data-parent="${p.id}">Reply</button>
    </div>`;
  li.appendChild(reps);

  li.querySelector("button[data-thread]").onclick=async(e)=>{
    if(!state.session){ location.href=urls.OAUTH_URL; return; }
    const ta = li.querySelector(".rp-text"); const text = ta.value.trim(); if(!text) return;
    ta.disabled = true;
    const ok = await createReply({ threadId:p.threadId, content:text, parentPostId:p.id }).catch(()=>false);
    ta.disabled = false;
    if(ok){ ta.value=""; await loadReplies(p.threadId); }
  };

  return li;
}

function bumpCount(btn, delta){
  const span = btn.querySelector('.count');
  const cur = parseInt(span.textContent || '0', 10) || 0;
  span.textContent = String(Math.max(0, cur + delta));
}

export async function loadReplies(threadId){
  const j = await listThreadPosts(threadId, 100);
  const replies=(j.items||[]).filter(x=>x.parentPostId!==null);
  const box = document.getElementById(`replylist_${threadId}`); if(!box) return;
  box.innerHTML="";
  replies.forEach(rep=>{
    const d=document.createElement("div"); d.className="indent";
    const tokens = extractBpTokens(rep.content);
    const text = stripBpTokens(rep.content);
    d.innerHTML = `
      <div class="phead">
        <img class="avatar" src="${cdnAvatar(rep.authorId,rep.authorAvatar)}" alt="">
        <span>${rep.authorName||'unknown'}</span>
        <span class="muted" style="margin-left:6px;">${new Date(rep.createdAt).toLocaleString()}</span>
      </div>
      ${text? `<div class="pcontent">${text.replace(/</g,'&lt;')}</div>`:''}`;
    tokens.forEach(b=> d.appendChild(makeBpCard(b)));
    box.appendChild(d);
  });
}

/* blueprint picker + import (same as before) */
const modal = $('#bpModal'), qServer=$("#qServer"), qBp=$("#qBp"), serversEl=$("#servers"), bpsEl=$("#bps"), bpUse=$("#bpUse"), bpCancel=$("#bpCancel");
let guilds=[], selectedGuild=null, bpList=[], selectedBp=null;

async function openPicker(){
  if(!state.session){ location.href=urls.OAUTH_URL; return; }
  modal.style.display='flex';
  bpUse.disabled=true; selectedGuild=null; selectedBp=null;
  serversEl.innerHTML='<div class="row" style="opacity:.7">Loading servers…</div>'; bpsEl.innerHTML='<div class="row" style="opacity:.7">Select a server</div>';
  try{ guilds = await getManageableGuilds(); renderGuilds(); }catch{ serversEl.innerHTML = '<div class="row">Failed to load servers</div>'; }
  qServer.oninput = renderGuilds;
  qBp.oninput = renderBps;
}
bpCancel.onclick = ()=>{ modal.style.display='none'; };
bpUse.onclick = ()=>{
  if(!selectedGuild || !selectedBp) return;
  state.pendingBps.push({ guildId:selectedGuild.id, serverName:selectedGuild.name||'', blueprintId:selectedBp.id, name:selectedBp.name||'(unnamed)' });
  renderBpChips();
  modal.style.display='none';
};
function renderGuilds(){
  const q=(qServer.value||'').toLowerCase().trim();
  const list=guilds.filter(g => (g.name||'').toLowerCase().includes(q) || String(g.id).includes(q));
  serversEl.innerHTML=''; list.forEach(g=>{ const row=document.createElement('div'); row.className='row'; row.textContent=`${g.name||'(unnamed)'} · ${g.id}`; row.onclick=()=>selectGuild(g); serversEl.appendChild(row); });
  if(!list.length) serversEl.innerHTML='<div class="row">No servers</div>';
}
async function selectGuild(g){
  selectedGuild=g; selectedBp=null; bpUse.disabled=true;
  bpsEl.innerHTML='<div class="row" style="opacity:.7">Loading blueprints…</div>';
  try{ bpList = await listBlueprints(g.id, g.name||''); }catch{ bpList=[]; }
  renderBps();
}
function renderBps(){
  const q=(qBp.value||'').toLowerCase().trim();
  const list=bpList.filter(b => (b.name||'').toLowerCase().includes(q) || String(b.id).includes(q));
  bpsEl.innerHTML=''; list.forEach(b=>{ const row=document.createElement('div'); row.className='row'; row.textContent=`${b.name||'(unnamed)'} · ${b.id}`; row.onclick=()=>{ selectedBp=b; bpUse.disabled=false; [...bpsEl.children].forEach(c=>c.style.background=''); row.style.background='#122147'; }; bpsEl.appendChild(row); });
  if(!list.length) bpsEl.innerHTML='<div class="row">No blueprints</div>';
}
function getTopSelectedGuild(){
  try{
    const f = window.top?.document?.getElementById('frame-blueprints');
    if (!f || !f.src) return null;
    const u = new URL(f.src, location.href);
    const gid = u.searchParams.get('guild_id');
    const gname = u.searchParams.get('guild_name');
    return gid ? { id: gid, name: gname||'' } : null;
  } catch { return null; }
}
function makeBpCard(b){
  const card = document.createElement('div'); card.className='bp-card';
  const letter = (b.serverName||b.guildId||'?').toString().slice(0,1).toUpperCase();
  card.innerHTML = `<div class="ico">${letter}</div>
    <div class="meta"><div class="name">${b.name||'(unnamed blueprint)'}</div>
    <div class="sub">from ${b.serverName||b.guildId}</div></div>
    <button class="btn" title="Copy into your open server">Import</button>`;
  card.querySelector('button').onclick = ()=> importBlueprint(b);
  return card;
}
async function importBlueprint(b){
  const dest = getTopSelectedGuild();
  if (!dest){ alert('Open a server first to import.'); return; }
  const srcList = await listBlueprints(b.guildId).catch(()=>[]);
  const src = Array.isArray(srcList) ? srcList.find(x=>String(x.id)===String(b.blueprintId)) : null;
  if (!src){ alert('Source blueprint not found.'); return; }
  const destList = await listBlueprints(dest.id, dest.name||'').catch(()=>[]);
  const existing = new Set((destList||[]).map(x=>String(x.name||'')));
  let newName = src.name || 'Blueprint'; if (existing.has(newName)) newName = `${newName} (copy)`;
  const ok = await createBlueprint({ guildId: dest.id, guildName: dest.name||'', id: `bp_${Date.now()}`, name: newName, data: src.data || {} });
  if (!ok){ alert('Failed to import.'); return; }
  try { window.top?.postMessage({ type:'openBlueprints' }, '*'); const f = window.top?.document?.getElementById('frame-blueprints'); if (f && f.contentWindow) f.contentWindow.location.reload(); } catch {}
}
