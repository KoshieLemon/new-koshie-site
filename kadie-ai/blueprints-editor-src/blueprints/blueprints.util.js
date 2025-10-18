// blueprints.util.js
// Canonical id mapping, active-node pick, and render verification.

import { els } from '../core/dom.js';
import { state } from '../core/state.js';

export function canonicalId(idOrName){
  const opts = Array.from(els.bpSelect?.options || []);
  const v = String(idOrName ?? '');
  const byVal = opts.find(o => String(o.value) === v);
  if (byVal) return String(byVal.value);
  const vTrim = v.trim().toLowerCase();
  const byText = opts.find(o => String(o.textContent || '').trim().toLowerCase() === vTrim);
  return byText ? String(byText.value) : v;
}

export function pickActiveNodeId(graph){
  const selId = state.sel && state.sel.size ? [...state.sel][0] : null;
  if (selId && graph.nodes?.some(n => n.id === selId)) return selId;
  return graph.nodes?.[0]?.id || null;
}

export function verifyGraphRendered(graph){
  const want = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const have = state.nodes instanceof Map ? state.nodes.size : 0;

  const missingInState = [];
  const missingInDom = [];

  const ids = new Set((graph.nodes || []).map(n => n.id));
  for (const id of ids) if (!state.nodes.has(id)) missingInState.push(id);

  for (const id of state.nodes.keys()){
    const nodeEl = els.nodesLayer?.querySelector?.(`.node[data-nid="${CSS.escape(id)}"]`);
    if (!nodeEl) missingInDom.push(id);
  }

  const activeId = pickActiveNodeId(graph);
  const activeOK = activeId
    ? !!els.nodesLayer?.querySelector?.(`.node[data-nid="${CSS.escape(activeId)}"]`)
    : want === 0;

  const ok = want === have && missingInState.length === 0 && missingInDom.length === 0 && activeOK;
  const details = [
    `expected=${want}`,
    `state=${have}`,
    missingInState.length ? `missingInState=[${missingInState.join(',')}]` : '',
    missingInDom.length ? `missingInDom=[${missingInDom.join(',')}]` : '',
    `active=${activeId || 'none'}`,
    `activeOK=${activeOK}`,
  ].filter(Boolean).join(' ');

  return { ok, details };
}
