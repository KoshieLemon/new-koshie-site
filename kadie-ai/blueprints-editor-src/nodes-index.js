/* eslint-disable no-console */
import { BOT_BASE as API } from './config.js';

let CACHE = { nodes: [], byId: new Map() };
let LOADED = false;

function normalize(def) {
  const ins  = Array.isArray(def?.inputs)  ? def.inputs  : [];
  const outs = Array.isArray(def?.outputs) ? def.outputs : [];
  const pins = {
    in:  ins.map(p => ({ name: String(p.name),  type: String(p.type || 'any') })),
    out: outs.map(p => ({ name: String(p.name), type: String(p.type || 'any') })),
  };
  return {
    id:        String(def.id),
    name:      String(def.name || def.id),
    category:  String(def.category || ''),
    kind:      String(def.kind || 'exec'),
    version:   String(def.version || '1.0.0'),
    inputs:  pins.in,
    outputs: pins.out,
    pins,
    params:  pins.in,
    returns: pins.out,
    hasExecIn:  pins.in.some(p => p.type === 'exec'),
    hasExecOut: pins.out.some(p => p.type === 'exec'),
    runtime: def.runtime || null,
    discord: def.discord || null,
    hidden: !!def.hidden,
    tags: Array.isArray(def.tags) ? def.tags.slice() : [],
  };
}

function injectVirtualNodes(nodes, byId){
  if (!byId.has('utils.breakObject')) {
    // Superset list kept for reference; dynamic expansion happens in interactions.js
    const breakOutputsSuperset = [
      { name:'out', type:'exec' },

      // Generic ids / timestamps
      { name:'id', type:'string' },
      { name:'guildId', type:'snowflake' },
      { name:'channelId', type:'snowflake' },
      { name:'createdTimestamp', type:'timestamp_ms' },

      // Message
      { name:'content', type:'string' },
      { name:'authorId', type:'snowflake' },
      { name:'pinned', type:'boolean' },
      { name:'tts', type:'boolean' },
      { name:'attachmentsCount', type:'int' },
      { name:'embedsCount', type:'int' },
      { name:'hasThread', type:'boolean' },
      { name:'url', type:'url' },
      { name:'type', type:'string' },

      // User
      { name:'username', type:'string' },
      { name:'globalName', type:'string' },
      { name:'bot', type:'boolean' },

      // Member
      { name:'userId', type:'snowflake' },
      { name:'nickname', type:'string' },
      { name:'joinedTimestamp', type:'timestamp_ms' },
      { name:'rolesCount', type:'int' },

      // Channel
      { name:'name', type:'string' },
      { name:'nsfw', type:'boolean' },
      { name:'topic', type:'string' },

      // VoiceChannel
      { name:'bitrate', type:'int' },
      { name:'userLimit', type:'int' },
      { name:'parentId', type:'snowflake' },

      // Role
      { name:'color', type:'color' },
      { name:'hoist', type:'boolean' },
      { name:'managed', type:'boolean' },
      { name:'position', type:'int' },
      { name:'permissions', type:'string' },

      // Interaction
      { name:'commandName', type:'string' },
      { name:'customId', type:'string' },

      // Invite
      { name:'code', type:'string' },
      { name:'expiresTimestamp', type:'timestamp_ms' },
      { name:'maxAge', type:'int' },
      { name:'maxUses', type:'int' },
      { name:'temporary', type:'boolean' },
      { name:'uses', type:'int' },
    ];

    const v = normalize({
      id: 'utils.breakObject',
      name: 'Break Object',
      category: 'Utilities',
      kind: 'exec',
      version: '1.0.0',
      // accept both names; interactions.js expands on connect
      inputs: [
        { name:'in',      type:'exec' },
        { name:'object',  type:'any' },
        { name:'payload', type:'any' }
      ],
      // start collapsed; only 'out' is visible until a wire sets the shape
      outputs: [{ name:'out', type:'exec' }],
    });

    nodes.push(v);
    byId.set(v.id, v);
  }
}

export async function fetchNodesIndex() {
  const url = `${API}/nodes-index`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const txt = await r.text().catch(() => '');
  if (!r.ok) {
    console.error('[nodes-index] GET /nodes-index failed', r.status, txt);
    CACHE = { nodes: [], byId: new Map() }; LOADED = false;
    window.NODE_INDEX = []; window.NODE_DEFS = {};
    return CACHE;
  }

  const data = txt ? JSON.parse(txt) : {};
  const raw  = Array.isArray(data?.nodes) ? data.nodes : [];

  const all   = raw.map(normalize);
  const byId  = new Map(all.map(n => [n.id, n]));
  let nodes   = all.filter(n => !n.hidden);

  injectVirtualNodes(nodes, byId);

  CACHE = { nodes, byId }; LOADED = true;
  window.NODE_INDEX = nodes;
  window.NODE_DEFS  = Object.fromEntries(byId);
  return CACHE;
}

export async function ensureNodesIndex() {
  if (!LOADED || CACHE.nodes.length === 0) return fetchNodesIndex();
  return CACHE;
}

export function getNodeDef(defId) { return CACHE.byId.get(defId) || null; }

export function groupNodesByCategory(list) {
  const root = {};
  for (const def of list) {
    const parts = String(def.category || '').split('.').filter(Boolean);
    let cur = root; for (const p of parts) cur = (cur[p] ||= {});
    cur[def.name] = def.id;
  }
  return root;
}
