// interactions.edges.js
// Edge helpers: incoming lookup, type checks, and auto-input selection.

import { state } from '../core/state.js';
import { colorKeyFor } from '../render/render.types.js';
import { ix } from './interactions.ctx.js';

export function incomingEdgeId(nid, pin){
  for (const [id,e] of state.edges.entries()){
    if (e.to?.nid === nid && e.to?.pin === pin) return id;
  }
  return null;
}

export function canConnectToPin(pinEl){
  if (!ix.dragWire || !pinEl) return { status:'' };

  const toSide = pinEl.classList.contains('right') ? 'right' : 'left';
  if (toSide === 'right') return { status: 'unvalid' };

  const toNodeEl = pinEl.closest('.node');
  const toNid = toNodeEl?.dataset?.nid;
  const toPin = pinEl.dataset.pin;
  const toKind = pinEl.classList.contains('exec') ? 'exec' : 'data';
  const toType = pinEl.dataset.type || (toKind==='exec' ? 'exec' : 'string');

  if (!toNodeEl || !toPin) return { status:'' };
  if (ix.dragWire.from.nid === toNid) return { status:'unvalid' };
  if (ix.dragWire.kind !== toKind) return { status:'unvalid' };

  if (ix.dragWire.kind === 'data'){
    const ckFrom = colorKeyFor(ix.dragWire.fromType);
    const ckTo   = colorKeyFor(toType);
    const wildcard = (String(ix.dragWire.fromType) === 'any' || String(toType) === 'any');
    if (!wildcard && ckFrom !== ckTo) return { status:'unvalid' };
  }

  const repl = incomingEdgeId(toNid, toPin);
  return { status: repl ? 'replace' : 'valid', toNid, toPin, toKind, toType, replaceId: repl };
}

export function pickAvailableInput(def, kind, fromType, nid){
  const pins = (def?.inputs || []).filter(p => (p.type==='exec'?'exec':'data') === kind);
  const ckFrom = colorKeyFor(fromType || 'any');
  const candidates = pins.filter(p => {
    if (kind === 'exec') return true;
    const ckTo = colorKeyFor(p.type || 'any');
    return p.type === 'any' || ckFrom === ckTo;
  });
  for (const p of candidates){
    if (!incomingEdgeId(nid, p.name)) return p.name;
  }
  return null;
}
