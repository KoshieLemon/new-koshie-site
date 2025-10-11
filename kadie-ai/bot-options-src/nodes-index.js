import { BOT_BASE } from './config.js';

export async function fetchNodesIndex(){
  const r = await fetch(`${BOT_BASE}/nodes-index`).catch(()=>null);
  if (!r || !r.ok) return { nodes: [] };
  return r.json();
}

export function groupNodesByCategory(nodes){
  const tree = {};
  for (const n of nodes || []){
    const parts = String(n.id).split('.');
    let cur = tree;
    for (let i=0;i<parts.length;i++){
      const p = parts[i];
      if (!cur[p]) cur[p] = (i === parts.length-1 ? { __leaf: n } : {});
      cur = cur[p];
    }
  }
  return tree;
}

// ---- UI helpers for pins ----
const TYPE_COLORS = {
  exec: '#57b2ff',
  string: '#7aa2f7',
  number: '#e0a96d',
  float: '#e0a96d',
  int: '#d99177',
  boolean: '#8bd17c',
  object: '#c3a6ff',
  TextBasedChannel: '#ffd166',
  Message: '#69dbff',
  User: '#f4978e',
  Guild: '#80ed99',
  Channel: '#ffd166',
  Snowflake: '#bdb2ff',
};

export function typeColor(t){
  return TYPE_COLORS[t] || '#adb5bd';
}

const INLINE_EDITABLE = new Set(['string','number','int','float','boolean']);

export function isInlineEditableType(t, def, pinName){
  // allow schema to force inline editable
  const inlineFlag = def?.ui?.inputsMeta?.[pinName]?.inline;
  if (typeof inlineFlag === 'boolean') return inlineFlag;
  return INLINE_EDITABLE.has(t);
}
