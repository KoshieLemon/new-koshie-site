// variables/channels.fetch.js
import { runtimeUrls, fetchFirstOkJson } from '../variables/variables-api.js';
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

async function loadLeaf(gid, leaf){
  const g = gid || activeGuildId();
  if (!g) return [];
  const base = (window?.KADIE?.botBase) || BOT_BASE || '';
  const urls = runtimeUrls(g, leaf, base);
  const arr = await fetchFirstOkJson(urls);
  return Array.isArray(arr) ? arr : [];
}

export const loadChannelsForGuild  = (gid)=> loadLeaf(gid, 'channels');
export const loadCategoriesForGuild = (gid)=> loadLeaf(gid, 'categories');
