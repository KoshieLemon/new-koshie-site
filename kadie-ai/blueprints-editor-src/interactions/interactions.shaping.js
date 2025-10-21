// interactions.shaping.js
// Live shaping for Break Object, ForEach / ForEachMap, enum-literal, and nodes
// that declare runtime.shape.targets. Non-destructive: rebuild from base pins,
// then apply dynamic param typing, then MIRROR overrides, then visibility rules.

import { state } from '../core/state.js';
import { renderAll } from '../render/render.editor.js';
import { colorKeyFor, toFinalPrimitive } from '../render/render.types.js';

/* ========== Def lookups ========== */
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

/* ========== Helpers ========== */
function arrayInnerType(t){
  const m = /^array<\s*([^>]+)\s*>$/i.exec(String(t||''));
  return m ? m[1].trim() : null;
}
function mapKeyValueTypes(t){
  const s = String(t || '').trim();
  const m = /^map<\s*([^,>]+)\s*,\s*([^>]+)\s*>$/i.exec(s);
  if (m) return { key:m[1].trim(), value:m[2].trim() };
  if (s === 'UserPermissions') return { key:'PermissionClient', value:'Permissions' };
  return { key:'any', value:'any' };
}
function enumTypeNames(){
  const E = (typeof window !== 'undefined' && window.ENUMS) || {};
  return Object.keys(E);
}
function isKnownEnumType(t){
  const E = (typeof window !== 'undefined' && window.ENUMS) || {};
  return !!(t && Array.isArray(E[t]));
}
function normEnumValue(v){
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object'){
    if ('value' in v && v.value != null) return String(v.value);
    if ('name'  in v && v.name  != null) return String(v.name);
    if ('key'   in v && v.key   != null) return String(v.key);
  }
  return String(v);
}

/* ========== Break Object fallback fields (safety) ========== */
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
  Emoji: [
    { name:'id', type:'string' },
    { name:'name', type:'string' },
    { name:'animated', type:'boolean' },
    { name:'available', type:'boolean' },
    { name:'managed', type:'boolean' },
    { name:'requiresColons', type:'boolean' },
    { name:'createdTimestamp', type:'number' },
    { name:'guildId', type:'string' },
    { name:'identifier', type:'string' },
    { name:'url', type:'string' }
  ],
  Reaction: [
    { name:'count', type:'number' },
    { name:'me', type:'boolean' },
    { name:'emoji', type:'Emoji' },
    { name:'emojiId', type:'string' },
    { name:'emojiName', type:'string' },
    { name:'emojiAnimated', type:'boolean' },
    { name:'emojiIdentifier', type:'string' },
    { name:'messageId', type:'string' },
    { name:'channelId', type:'string' },
    { name:'guildId', type:'string' },
    { name:'usersCount', type:'number' }
  ]
};

/* ========== Base snapshot ========== */
function ensureBaseSnapshot(n, baseDef){
  if (!n._defBasePins){
    n._defBasePins = {
      inputs:  (baseDef.inputs  || []).map(p => ({...p})),
      outputs: (baseDef.outputs || []).map(p => ({...p}))
    };
  }
}

/* ========== Build effective pins from base + dynamic + mirror + visibility ========== */
function rebuildNodeDef(nid){
  const n = state.nodes.get(nid); if (!n) return;
  const baseDef = getDef(n.defId); if (!baseDef) return;

  ensureBaseSnapshot(n, baseDef);

  const params = n.params || {};
  const inPinsBase  = n._defBasePins.inputs.map(p => ({...p}));
  const outPinsBase = n._defBasePins.outputs.map(p => ({...p}));

  // 1) dynamic typing from ui.dynamic* mappings
  const dynOut = baseDef?.ui?.dynamicOutputFromParam;
  if (dynOut && dynOut.param && dynOut.pin){
    const chosen = normEnumValue(params[dynOut.param]);
    if (chosen){
      const pin = outPinsBase.find(p => p.name === dynOut.pin);
      if (pin) pin.type = chosen;
    }
  }
  const dynIn = baseDef?.ui?.dynamicInputFromParam;
  if (dynIn && dynIn.param && dynIn.pin){
    const chosen = normEnumValue(params[dynIn.param]);
    if (chosen){
      const pin = inPinsBase.find(p => p.name === dynIn.pin);
      if (pin) pin.type = chosen;
    }
  }

  // 2) MIRROR overrides persisted on node
  const mir = n._ui?.mirror || {};
  if (mir.inputs){
    for (const [name,t] of Object.entries(mir.inputs)){
      const pin = inPinsBase.find(p => p.name === name);
      if (pin && t) pin.type = t;
    }
  }
  if (mir.outputs){
    for (const [name,t] of Object.entries(mir.outputs)){
      const pin = outPinsBase.find(p => p.name === name);
      if (pin && t) pin.type = t;
    }
  }

  // 3) Visibility rules from runtime.shape.hideWhen
  const shape = baseDef?.runtime?.shape;
  const rules = Array.isArray(shape?.hideWhen) ? shape.hideWhen : null;

  const hiddenIn  = new Set();
  const hiddenOut = new Set();

  if (rules && rules.length){
    for (const r of rules){
      const whenPin = r?.when?.pin;
      const equals  = r?.when?.equals;
      if (!whenPin || typeof r?.hide === 'undefined') continue;
      const val = normEnumValue(params[whenPin]);
      if (val === equals){
        for (const tgt of r.hide){
          const [side,name] = String(tgt).split('.');
          if (side === 'inputs')  hiddenIn.add(name);
          else if (side === 'outputs') hiddenOut.add(name);
        }
      }
    }
  }

  const inPins  = inPinsBase .filter(p => !hiddenIn.has(p.name));
  const outPins = outPinsBase.filter(p => !hiddenOut.has(p.name));

  // Drop edges to hidden inputs and clear their params
  for (const [eid,e] of [...state.edges]){
    if (e.to?.nid === nid && hiddenIn.has(e.to.pin)) state.edges.delete(eid);
  }
  if (n.params){ for (const k of hiddenIn) delete n.params[k]; }

  const isExec = String(baseDef.kind || 'exec') === 'exec';
  n._defOverride = {
    id: baseDef.id, name: baseDef.name, category: baseDef.category, kind: baseDef.kind, version: baseDef.version,
    inputs: inPins, outputs: outPins, hasExecIn: isExec, hasExecOut: isExec,
    pins: { in: inPins, out: outPins },
    params: n.params || {},
    returns: outPins,
    runtime: baseDef.runtime,
    ui: baseDef.ui
  };
}

export function applyVisibilityRules(nid){
  rebuildNodeDef(nid);
  renderAll();
}

/* ========== Break Object shaping ========== */
function mergeShapes(baseKey){
  const SH = window.DISCORD_SHAPES || {};
  const FB = window.BREAK_FALLBACKS || {};
  const pick = (k) => (Array.isArray(SH[k]) ? SH[k] : []);
  const seen = new Set();
  const out  = [];

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
      out.push({ name:f.name, type:f.type });
    }
  }
  for (const f of (FB[baseKey] || [])){
    if (!f || !f.name) continue;
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    out.push({ name:f.name, type:f.type });
  }
  for (const f of (FALLBACK_SHAPE[baseKey] || [])){
    if (!f || !f.name) continue;
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    out.push({ name:f.name, type:f.type });
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

  const baseDef = getDef(n.defId) || { id: n.defId, name: 'Break Object', category: 'Flow', kind: 'pure', version: '1.1.8' };
  const isExec = String(baseDef.kind || 'exec') === 'exec';

  const inPins = isExec
    ? [{ name:'in', type:'exec' }, { name:'object', type: objType }]
    : [{ name:'object', type: objType }];

  const raw = shapeForType(sourceType);
  const finalDataPins = raw.map(f => ({ name: f.name, type: toFinalPrimitive(f.type) }));
  const outPins = isExec
    ? [{ name:'out', type:'exec' }, ...finalDataPins]
    : finalDataPins;

  n._defOverride = {
    id: baseDef.id,
    name: baseDef.name,
    category: baseDef.category,
    kind: baseDef.kind,
    version: baseDef.version,
    inputs: inPins,
    outputs: outPins,
    hasExecIn: isExec, hasExecOut: isExec,
    pins: { in: inPins, out: outPins },
    params: n.params || {},
    returns: outPins
  };

  renderAll();
}

/* ========== MIRROR typing (ForEach / ForEachMap / explicit targets) ========== */
function isForEachDef(def){
  if (!def) return false;
  const id = String(def.id||'');
  const nm = String(def.name||'');
  if (/for\s*each$/i.test(nm) || /forEach$/i.test(id) || /\.forEach$/i.test(id)) return true;
  const hasArrayIn = (def.inputs||[]).some(p => p.name === 'array' || /^array<.+>$/i.test(String(p.type||'')));
  const hasValueOut = (def.outputs||[]).some(p => p.name === 'value');
  return hasArrayIn && hasValueOut;
}
function isForEachMapDef(def){
  if (!def) return false;
  const id = String(def.id||'');
  const nm = String(def.name||'');
  if (/for\s*each\s*map$/i.test(nm) || /forEachMap$/i.test(id) || /\.forEachMap$/i.test(id)) return true;
  const hasMapIn = (def.inputs||[]).some(p => p.name === 'map' || /^map<.+>$/i.test(String(p.type||'')));
  const hasKeyOut = (def.outputs||[]).some(p => p.name === 'key');
  const hasValOut = (def.outputs||[]).some(p => p.name === 'value');
  return hasMapIn && hasKeyOut && hasValOut;
}

export function applyMirrorShape(nid, def, sourceType){
  const n = state.nodes.get(nid); if (!n) return;
  const base = getDef(n.defId) || def; if (!base) return;

  n._ui = n._ui || {};
  n._ui.mirror = n._ui.mirror || { inputs:{}, outputs:{} };

  if (isForEachDef(base)){
    const elem = arrayInnerType(sourceType) || 'any';
    n._ui.mirror.outputs.value = elem;
    n._ui.mirror.outputs.index = 'int';
  } else if (isForEachMapDef(base)){
    const kv = mapKeyValueTypes(sourceType || 'map<any,any>');
    n._ui.mirror.outputs.key   = kv.key;
    n._ui.mirror.outputs.value = kv.value;
  } else if (base?.runtime?.shape?.targets && Array.isArray(base.runtime.shape.targets)){
    for (const t of base.runtime.shape.targets){
      const [side,name] = String(t).split('.');
      if (side === 'outputs') n._ui.mirror.outputs[name] = sourceType || n._ui.mirror.outputs[name];
      else if (side === 'inputs') n._ui.mirror.inputs[name] = sourceType || n._ui.mirror.inputs[name];
    }
  } else {
    return;
  }

  rebuildNodeDef(nid);
  renderAll();
}

/* ========== Incoming type resolution ========== */
function effectiveDef(node){ return node?._defOverride || getDef(node?.defId); }
function currentOutputType(node, pinName){
  const def = effectiveDef(node);
  const p = def?.outputs?.find?.(x => x.name === pinName);
  return p?.type || null;
}
function incomingTypeFor(nid, pinName){
  let edgeIn = null;
  for (const e of state.edges.values()){
    if (e?.kind === 'data' && e?.to?.nid === nid && e?.to?.pin === pinName){ edgeIn = e; break; }
  }
  if (!edgeIn) return null;
  const srcNode = state.nodes.get(edgeIn.from?.nid);
  let t = srcNode ? currentOutputType(srcNode, edgeIn.from?.pin) : null;

  // Fallback to DOM dataset if def not yet overridden
  if (!t && typeof document !== 'undefined'){
    const sel = `[data-nid="${edgeIn.from?.nid}"] .pin.right[data-pin="${edgeIn.from?.pin}"]`;
    const dt = document.querySelector(sel)?.dataset?.type;
    if (dt) t = dt;
  }
  return t;
}

export function refreshMirrorShapes(){
  if (!state || !(state.edges instanceof Map) || !(state.nodes instanceof Map)) return;

  for (const [nid, n] of state.nodes){
    if (!n) continue;
    const def = getDef(n.defId);
    if (!def) continue;

    if (isForEachDef(def)){
      const inPin = (def.inputs||[]).find(p => p.name === 'array') ||
                    (def.inputs||[]).find(p => p.type !== 'exec');
      if (!inPin) continue;
      const srcType = incomingTypeFor(nid, inPin.name);
      if (!srcType) continue;
      applyMirrorShape(nid, def, srcType);
      continue;
    }

    if (isForEachMapDef(def)){
      const inPin = (def.inputs||[]).find(p => p.name === 'map') ||
                    (def.inputs||[]).find(p => /^map<.+>$/i.test(String(p.type||''))) ||
                    (def.inputs||[]).find(p => p.type !== 'exec');
      if (!inPin) continue;
      const srcType = incomingTypeFor(nid, inPin.name);
      if (!srcType) continue;
      applyMirrorShape(nid, def, srcType);
      continue;
    }

    if (def?.runtime?.shape?.targets){
      const firstIn = (def.inputs || []).find(p => p?.type !== 'exec');
      if (!firstIn) continue;
      const t = incomingTypeFor(nid, firstIn.name);
      if (!t) continue;
      applyMirrorShape(nid, def, t);
    }
  }
}

/* ========== Live Break Object auto-refresh (kept) ========== */
function shapeForBreakObject(nid){
  const t = incomingTypeFor(nid, 'object');
  if (t) applyBreakObjectShape(nid, t, 'object');
}
export function refreshBreakObjectShapes(){
  if (!state || !(state.edges instanceof Map) || !(state.nodes instanceof Map)) return;
  const ids = [];
  for (const [nid, n] of state.nodes){
    if (!n) continue;
    const base = getDef(n.defId);
    if (n.defId === 'flow.breakObject' || base?.name === 'Break Object') ids.push(nid);
  }
  for (const nid of ids) shapeForBreakObject(nid);
}

/* ========== Enum Literal shaping (kept) ========== */
export function applyEnumLiteralShape(nid){
  const n = state.nodes.get(nid); if (!n) return;
  const def = getDef(n.defId); if (!def) return;

  const isEnumLiteral =
    def.id === 'literals.getLiteralEnum' ||
    (def.runtime && def.runtime.shape && def.runtime.shape.kind === 'enum-literal');
  if (!isEnumLiteral) return;

  const params = n.params || {};
  const sel = String(params.enumType || '').trim();
  const valid = isKnownEnumType(sel);
  const literalType = valid ? sel : 'string';

  const enumTypes = enumTypeNames();

  const inPins = [
    { name: 'enumType', type: 'string', enum: enumTypes, desc: 'Enum type' },
    { name: 'literal',  type: literalType, desc: 'Enum literal' }
  ];
  const outPins = [
    { name: 'value', type: literalType, desc: 'Selected enum literal' }
  ];

  n._defOverride = {
    id: def.id, name: def.name, category: def.category, kind: def.kind, version: def.version,
    inputs: inPins, outputs: outPins, hasExecIn: false, hasExecOut: false,
    pins: { in: inPins, out: outPins },
    params: n.params || {},
    returns: outPins,
    runtime: def.runtime
  };

  renderAll();
}

/* ========== wire/type-change triggers ========== */
if (typeof window !== 'undefined'){
  const trigger = () => { refreshBreakObjectShapes(); refreshMirrorShapes(); };
  window.addEventListener('wires:recalc', trigger);
  window.addEventListener('pin:type-changed', trigger);
  window.addEventListener('edge:added', trigger);
  window.addEventListener('edge:removed', trigger);
}
