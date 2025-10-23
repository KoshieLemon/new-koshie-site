// variables-ctx.js
// Shared state, constants, and small utilities for the Variables Dock.

import { TYPE_COLORS, colorKeyFor } from '../render/render.types.js';

export const VDock = {
  gid: null,
  BOT_BASE: null,
  VARS: [],          // editable variables [{name,type}]
  SNAP: [],          // last-saved snapshot
  FULL: { channels: [], roles: [], messages: [] }, // inherited guild data
  varsDirty: false,
  els: null          // resolved DOM refs
};

// Persistent keys and layout constraints
export const KEYS = {
  WIDTH: 'kadie.varsDock.width',
  LOCAL_SNAP: 'kadie.vars._global.snap'
};
export const LAYOUT = { MIN_W: 240, MAX_W: 640 };

// Hard limit for variable count
export const LIMITS = { MAX_VARS: 15 };

// Utilities
export function typeColor(t){
  return TYPE_COLORS[colorKeyFor(t || 'string')] || '#a3a3a3';
}
export function mix(a, b, t){
  function hexToRgb(h){ const n=parseInt(h.slice(1),16); return {r:(n>>16)&255,g:(n>>8)&255,b:(n>>8>>8)&255}; }
  function toHex(n){ return n.toString(16).padStart(2,'0'); }
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(A.r*(1-t)+B.r*t);
  const g = Math.round(A.g*(1-t)+B.g*t);
  const bl= Math.round(A.b*(1-t)+B.b*t);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
export function cleanLabelToVarName(label){
  return String(label || '')
    .replace(/^[#@ ]+/, '')
    .replace(/[^a-zA-Z0-9_]+/g,'_')
    .replace(/^_+|_+$/g,'') || 'Var';
}
export function uniqueName(base, taken){
  let name = String(base||'').replace(/[^a-zA-Z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
  if (!name) name = 'Var';
  if (!taken.has(name)) return name;
  let i = 2; while (taken.has(`${name}_${i}`)) i++;
  return `${name}_${i}`;
}
