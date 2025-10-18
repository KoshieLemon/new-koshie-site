// /community-forums-src/api-client.js
import { OAUTH_URL, ME_URL, NODE_API_BASE, apiGet, apiGetFirst, GUILDS_URLS } from '../api.js';

export const API = NODE_API_BASE;
export const urls = { OAUTH_URL, ME_URL };

export async function getSession(){
  try {
    const r = await apiGet(ME_URL,'GET /me (forums)');
    if (!r.ok) return null;
    const j = await r.json().catch(()=>null);
    return j?.user || null;
  } catch { return null; }
}

export const cdnAvatar = (id, avatar) => avatar
  ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`
  : `https://cdn.discordapp.com/embed/avatars/1.png`;

export async function fetchFeed({ sort, cursor, tag }){
  const qs = new URLSearchParams();
  if (sort) qs.set('sort', sort);
  if (cursor) qs.set('cursor', cursor);
  if (tag) qs.set('tag', tag);
  const r = await fetch(`${API}/forums/feed?${qs}`, { credentials:'include', cache:'no-store' });
  return r.ok ? r.json() : { items:[], nextCursor:null };
}

export async function createRootPost({ content, tag }){
  const r = await fetch(`${API}/forums/feed/posts`, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ content, tag })
  });
  if (!r.ok) throw new Error('create_failed');
  return r.json();
}

export async function toggleLike(postId, on){
  const r = await fetch(`${API}/forums/likes`, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ postId, on })
  });
  return r.ok;
}

export async function toggleBookmark(postId, on){
  const r = await fetch(`${API}/forums/bookmarks`, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ targetType:'post', targetId: postId, on })
  });
  return r.ok;
}

export async function listThreadPosts(threadId, limit=100){
  const r = await fetch(`${API}/forums/posts?thread=${encodeURIComponent(threadId)}&limit=${limit}`, { credentials:'include', cache:'no-store' });
  return r.ok ? r.json() : { items:[] };
}

export async function createReply({ threadId, content, parentPostId }){
  const r = await fetch(`${API}/forums/posts`, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ threadId, content, parentPostId })
  });
  return r.ok;
}

export async function getPostsByIds(ids){
  if (!ids?.length) return [];
  const r = await fetch(`${API}/forums/posts/byIds?ids=${encodeURIComponent(ids.join(','))}`, { credentials:'include' });
  const j = r.ok ? await r.json().catch(()=>({items:[]})) : {items:[]};
  return Array.isArray(j.items) ? j.items : [];
}

/* blueprints */
export async function getManageableGuilds(){
  const { res } = await apiGetFirst(GUILDS_URLS, 'guilds');
  return res.json();
}
export async function listBlueprints(gid, gname=''){
  const u = new URL(`${API}/blueprints`, location.href);
  u.searchParams.set('guild_id', gid);
  if (gname) u.searchParams.set('guild_name', gname);
  const r = await fetch(u, { credentials:'include' });
  return r.ok ? r.json() : [];
}
export async function createBlueprint({ guildId, guildName, id, name, data }){
  const u = new URL(`${API}/blueprints`, location.href);
  u.searchParams.set('guild_id', guildId);
  if (guildName) u.searchParams.set('guild_name', guildName);
  const r = await fetch(u, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id, name, data })
  });
  return r.ok;
}
