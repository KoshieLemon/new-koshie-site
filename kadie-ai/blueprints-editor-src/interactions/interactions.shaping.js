// Dynamic node shaping: Break Object, mirror typing, visibility rules, and ForEach element typing.

import { state } from '../core/state.js';
import { renderAll } from '../render/render.editor.js';
import { colorKeyFor, toFinalPrimitive } from '../render/render.types.js';

export function getDef(defId){
  const list = (state.nodesIndex?.nodes || window.NODE_INDEX || []);
  const found = list.find(d => d.id === defId);
  return found || (window.NODE_DEFS && window.NODE_DEFS[defId]) || null;
}
export function getOutputType(defId,pinName){
  const def = getDef(defId);
  const pin = def?.outputs?.find?.(p => p.name === pinName);
  return pin?.type || null;
}

// ---------- helpers ----------
function arrayInnerType(t){
  const m = /^array<\s*([^>]+)\s*>$/i.exec(String(t||''));
  return m ? m[1] : null;
}

// ---------- Break Object shaping ----------
const FALLBACK_SHAPE = {
  Channel: [
    { name:'id', type:'string' }, { name:'name', type:'string' }, { name:'guildId', type:'string' },
    { name:'nsfw', type:'boolean' }, { name:'topic', type:'string' }, { name:'type', type:'string' },
    { name:'createdTimestamp', type:'number' }, { name:'parentId', type:'string' }
  ],
  TextBasedChannel: [
    { name:'rateLimitPerUser', type:'number' }, { name:'defaultAutoArchiveDuration', type:'number' },
    { name:'lastMessageId', type:'string' }
  ],
  VoiceBasedChannel: [
    { name:'bitrate', type:'number' }, { name:'userLimit', type:'number' }
  ],
  CategoryChannel: [
    { name:'parentId', type:'string' }
  ],
  Message: [
    { name:'id', type:'string' }, { name:'content', type:'string' }, { name:'authorId', type:'string' },
    { name:'channelId', type:'string' }, { name:'guildId', type:'string' }, { name:'createdTimestamp', type:'number' },
    { name:'pinned', type:'boolean' }, { name:'tts', type:'boolean' }, { name:'attachmentsCount', type:'number' },
    { name:'embedsCount', type:'number' }, { name:'hasThread', type:'boolean' }, { name:'url', type:'string' }, { name:'type', type:'string' }
  ],
  User: [
    { name:'id', type:'string' }, { name:'username', type:'string' }, { name:'globalName', type:'string' },
    { name:'bot', type:'boolean' }, { name:'createdTimestamp', type:'number' }
  ],
  GuildMember: [
    { name:'userId', type:'string' }, { name:'nickname', type:'string' }, { name:'joinedTimestamp', type:'number' },
    { name:'pending', type:'boolean' }, { name:'rolesCount', type:'number' }, { name:'guildId', type:'string' }
  ],
  Invite: [
    { name:'code', type:'string' }, { name:'url', type:'string' }, { name:'channelId', type:'string' },
    { name:'guildId', type:'string' }, { name:'inviterId', type:'string' }, { name:'createdTimestamp', type:'number' },
    { name:'expiresTimestamp', type:'number' }, { name:'maxAge', type:'number' }, { name:'maxUses', type:'number' },
    { name:'temporary', type:'boolean' }, { name:'uses', type:'number' }
  ],
  Role: [
    { name:'id', type:'string' }, { name:'name', type:'string' }, { name:'color', type:'color' },
    { name:'hoist', type:'boolean' }, { name:'managed', type:'boolean' }, { name:'position', type:'number' },
    { name:'permissions', type:'bigint' }
  ],
  Interaction: [
    { name:'id', type:'string' }, { name:'userId', type:'string' }, { name:'channelId', type:'string' },
    { name:'guildId', type:'string' }, { name:'commandName', type:'string' }, { name:'customId', type:'string' },
    { name:'createdTimestamp', type:'number' }, { name:'type', type:'string' }
  ],
  // NEW: PermissionsEntry shape → precise enum pins
  PermissionsEntry: [
    { name:'name',  type:'PermissionName'  },
    { name:'state', type:'PermissionState' }
  ]
};

function mergeShapes(baseKey){
  const SH = window.DISCORD_SHAPES || {};
  const pick = (k) => (Array.isArray(SH[k]) ? SH[k] : []);
  const seen = new Set();
  const out = [];

  const queue = [baseKey];
  if (baseKey === 'Channel') queue.push('TextBasedChannel','VoiceBasedChannel','CategoryChannel');
  if (baseKey === 'TextBasedChannel') queue.push('Channel');
  if (baseKey === 'VoiceBasedChannel') queue.push('Channel');
  if (baseKey === 'Interaction') queue.push('ChatInputCommandInteraction','MessageComponentInteraction','ModalSubmitInteraction','AutocompleteInteraction');

  for (const key of queue){
    for (const f of pick(key)){
      if (!f || !f.name) continue;
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      out.push({ name: f.name, type: f.type });
    }
  }

  const fb = FALLBACK_SHAPE[baseKey] || [];
  for (const f of fb){
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    out.push({ name: f.name, type: f.type });
  }

  return out;
}

function shapeForType(t){
  const key = colorKeyFor(t) || 'string';
  return mergeShapes(key);
}

export function applyBreakObjectShape(nid, sourceType, whichPin='object'){
  const n = state.nodes.get(nid); if (!n) return;

  const objType = whichPin === 'object' ? (sourceType || 'any') : 'any';

  const inPins = [
    { name:'in', type:'exec' },
    { name:'object', type: objType }
  ];

  const raw = shapeForType(sourceType);
  const finalDataPins = raw.map(f => ({ name: f.name, type: toFinalPrimitive(f.type) }));
  const outPins = [{ name:'out', type:'exec' }, ...finalDataPins];

  n._defOverride = {
    id: n.defId,
    name: 'Break Object',
    category: 'Utilities',
    kind: 'exec',
    version: '1.1.2',
    inputs: inPins,
    outputs: outPins,
    hasExecIn: true, hasExecOut: true,
    pins: { in: inPins, out: outPins },
    params: inPins, returns: outPins
  };

  applyVisibilityRules(nid);
  renderAll();
}

// ---------- Mirror shape with special handling for ForEach ----------
export function applyMirrorShape(nid, def, sourceType){
  const n = state.nodes.get(nid); if (!n || !def?.runtime?.shape) return;
  const { mirrorFrom, targets } = def.runtime.shape || {};
  if (!mirrorFrom || !targets || !Array.isArray(targets)) return;

  const base = n._defOverride || def;
  const inPins  = (base.inputs  || []).map(p => ({...p}));
  const outPins = (base.outputs || []).map(p => ({...p}));

  // ForEach: value type follows array element; index is int
  if (def.id === 'flow.forEach'){
    const elem = arrayInnerType(sourceType) || 'any';
    for (const p of outPins){
      if (p.name === 'value') p.type = elem;
      if (p.name === 'index') p.type = 'int';
    }
  }

  for (const t of targets){
    const [side,name] = String(t).split('.');
    const arr = side === 'outputs' ? outPins : inPins;
    const pin = arr.find(p => p.name === name);
    if (pin) pin.type = sourceType || pin.type;
  }

  n._defOverride = {
    id: def.id, name: def.name, category: def.category, kind: def.kind, version: def.version,
    inputs: inPins, outputs: outPins, hasExecIn: true, hasExecOut: true,
    pins: { in: inPins, out: outPins }, params: inPins, returns: outPins
  };

  applyVisibilityRules(nid);
  renderAll();
}

export function applyVisibilityRules(nid){
  const n = state.nodes.get(nid); if (!n) return;
  const baseDef = getDef(n.defId);
  const active = n._defOverride || baseDef;
  const shape = active?.runtime?.shape || baseDef?.runtime?.shape;
  const rules = Array.isArray(shape?.hideWhen) ? shape.hideWhen : null;
  if (!rules || rules.length === 0) return;

  const params = n.params || {};
  const hiddenIn  = new Set();
  const hiddenOut = new Set();

  for (const r of rules){
    const whenPin = r?.when?.pin;
    const equals  = r?.when?.equals;
    if (!whenPin || typeof r?.hide === 'undefined') continue;
    const val = params[whenPin];
    if (val === equals){
      for (const tgt of r.hide){
        const [side,name] = String(tgt).split('.');
        if (side === 'inputs') hiddenIn.add(name);
        else if (side === 'outputs') hiddenOut.add(name);
      }
    }
  }

  if (hiddenIn.size === 0 && hiddenOut.size === 0) return;

  const inPins  = (active.inputs  || []).filter(p => !hiddenIn.has(p.name));
  const outPins = (active.outputs || []).filter(p => !hiddenOut.has(p.name));

  for (const [eid,e] of [...state.edges]){
    if (e.to?.nid === nid && hiddenIn.has(e.to.pin)) state.edges.delete(eid);
  }
  if (n.params){ for (const k of hiddenIn) delete n.params[k]; }

  n._defOverride = {
    id: active.id, name: active.name, category: active.category, kind: active.kind, version: active.version,
    inputs: inPins, outputs: outPins, hasExecIn: true, hasExecOut: true,
    pins: { in: inPins, out: outPins }, params: inPins, returns: outPins
  };
}
