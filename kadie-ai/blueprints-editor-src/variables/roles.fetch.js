// variables/roles.fetch.js
// Site-side roles loader that tries BOT_BASE, /runtime, and /api/runtime.

import { loadRolesForGuild as apiLoadRoles, runtimeUrls, fetchFirstOkJson } from '../variables/variables-api.js';
import { BOT_BASE } from '../core/config.js';

function activeGuildId(){
  try{
    return (window?.KADIE?.guildId)
        || (document.body?.dataset?.guildId)
        || new URL(window.location.href).searchParams.get('guild_id')
        || new URL(window.location.href).searchParams.get('gid')
        || window.__ACTIVE_GUILD_ID__
        || null;
  }catch{ return null }
}

export async function loadRolesForGuild(gid){
  const g = gid || activeGuildId();
  if (!g) return [];
  const base = (window?.KADIE?.botBase) || BOT_BASE || '';
  // Prefer shared helper. If it ever changes, we can fall back to direct URLs.
  try{
    const arr = await apiLoadRoles(g, base);
    if (Array.isArray(arr) && arr.length) return arr;
  }catch{}
  const urls = runtimeUrls(g, 'roles', base);
  return await fetchFirstOkJson(urls);
}
