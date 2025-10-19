// Universal node DOM builder used by both editor and menus.
// Adds a visible "+" button to Make Map nodes that appends key/value pins.

import { ensureTypeStylesInjected, colorKeyFor, cssToken } from './render.types.js';

ensureTypeStylesInjected();

function execPins(arr){ return (arr || []).filter(p => p.type === 'exec'); }
function dataPins(arr){ return (arr || []).filter(p => p.type !== 'exec'); }

function mkPin(side, pinDef){
  const kind = pinDef.type === 'exec' ? 'exec' : 'data';
  const colorKey = colorKeyFor(pinDef.type || 'string');
  const el = document.createElement('div');
  el.className = `pin ${side} ${kind} ${kind==='data' ? ('t-' + cssToken(colorKey)) : ''}`;
  el.dataset.pin  = pinDef.name;
  el.dataset.kind = kind;
  el.dataset.type = pinDef.type || 'string';
  el.title = pinDef.type || (kind==='exec' ? 'exec' : 'string');

  const jack = document.createElement('span'); jack.className = 'jack';
  const label = document.createElement('span'); label.className = 'label'; label.textContent = pinDef.name;

  if (side === 'right') { el.appendChild(label); el.appendChild(jack); }
  else { el.appendChild(jack); el.appendChild(label); }

  return el;
}

function autosize(el){
  if (!el) return;
  if (el.tagName === 'TEXTAREA'){
    el.style.height = 'auto';
    el.style.height = `${Math.max(18, el.scrollHeight)}px`;
    const w = Math.min(240, 18 + el.value.length * 6);
    el.style.width = `${w}px`;
  } else {
    const w = Math.min(240, Math.max(18, 8 * String(el.value || '').length + 16));
    el.style.width = `${w}px`;
  }
}

function isIdLike(t){ return /Id$/.test(String(t||'')); }
function isEnumType(t){
  const ENUMS = (window && window.ENUMS) || {};
  return Array.isArray(ENUMS?.[t]);
}
function shouldRenderControl(t){
  const k = colorKeyFor(t || 'string');
  if (isEnumType(t)) return true;
  if (k === 'boolean') return true;
  return k === 'number' || k === 'string' || isIdLike(t);
}

function cleanNumeric(v, allowDot){
  if (v == null) return '';
  let s = String(v);
  s = s.replace(/[, _]/g, '');
  s = s.replace(/[^\d.]/g, '');
  if (!allowDot) s = s.replace(/\./g, '');
  if (allowDot){
    const first = s.indexOf('.');
    if (first !== -1){
      const head = s.slice(0, first + 1);
      const tail = s.slice(first + 1).replace(/\./g, '');
      s = head + tail;
    }
  }
  while (s.startsWith('.')) s = s.slice(1);
  return s;
}

function mkLiteral(preview, paramsRef, pinDef){
  const wrap = document.createElement('div');
  wrap.className = 'literal-wrap';

  const rawType = pinDef.type || 'string';
  const key = colorKeyFor(rawType);
  const ENUMS = (window && window.ENUMS) || {};
  const enumValues = Array.isArray(pinDef.enum) ? pinDef.enum : (Array.isArray(ENUMS?.[rawType]) ? ENUMS[rawType] : null);

  let input;

  if (enumValues){
    const sel = document.createElement('select');
    sel.className = 'literal pin-input';
    const makeOpt = (v)=> {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = String(v);
      return o;
    };
    sel.appendChild(makeOpt(''));
    for (const v of enumValues) sel.appendChild(makeOpt(v));
    const cur = paramsRef?.[pinDef.name];
    sel.value = (cur == null ? '' : String(cur));
    if (preview) sel.disabled = true;
    input = sel;
  } else if (key === 'boolean'){
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'pin-input';
    chk.checked = !!(paramsRef?.[pinDef.name]);
    if (preview) chk.disabled = true;
    input = chk;
  } else if (key === 'number'){
    const allowDot = String(rawType).toLowerCase() !== 'int';
    const txt = document.createElement('input');
    txt.type = 'text';
    txt.inputMode = 'decimal';
    txt.pattern = '[0-9.]*';
    txt.className = 'literal pin-input';
    txt.value = paramsRef?.[pinDef.name] ?? '';
    autosize(txt);
    if (!preview){
      txt.addEventListener('input', ()=> autosize(txt));
      txt.addEventListener('blur', ()=>{
        txt.value = cleanNumeric(txt.value, allowDot);
        autosize(txt);
      });
      txt.addEventListener('paste', ()=> { requestAnimationFrame(()=> autosize(txt)); });
    } else {
      txt.disabled = true;
    }
    input = txt;
  } else {
    const ta = document.createElement('textarea');
    ta.rows = 1;
    ta.maxLength = 100;
    ta.className = 'literal pin-input';
    ta.value = paramsRef?.[pinDef.name] ?? '';
    autosize(ta);
    if (!preview){
      ta.addEventListener('input', ()=> autosize(ta));
    } else {
      ta.disabled = true;
    }
    input = ta;
  }

  if (!preview){
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.stopPropagation(); } });
    input.addEventListener('contextmenu', e => e.stopPropagation());
  }

  wrap.appendChild(input);
  return wrap;
}

// ---- makeMap helpers ----
function isMakeMapDef(def){
  const id = String(def?.id || '');
  const nm = String(def?.name || '');
  return id === 'makeMap' || id === 'utils.makeMap' || /(^|\s)make\s*map/i.test(nm);
}

// Build effective inputs: base inputs + any dynamic keyN/valueN derived from params
function augmentedInputsForMakeMap(def, params){
  const base = Array.isArray(def?.inputs) ? def.inputs : [];
  if (!isMakeMapDef(def)) return base;

  const eff = base.slice();

  // detect base pair in def: either key/value OR key1/value1
  const hasKey1 = base.some(p => p?.name === 'key1');
  const hasVal1 = base.some(p => p?.name === 'value1');
  const baseKey = hasKey1 ? 'key1' : (base.some(p=>p?.name==='key') ? 'key' : null);
  const baseVal = hasVal1 ? 'value1' : (base.some(p=>p?.name==='value') ? 'value' : null);
  if (!baseKey || !baseVal) return eff; // leave untouched if definition is unusual

  // determine highest index present in params
  let maxIdx = 1;
  for (const k of Object.keys(params||{})){
    let m = /^key(\d+)$/.exec(k); if (m) maxIdx = Math.max(maxIdx, Number(m[1]));
    m = /^value(\d+)$/.exec(k);   if (m) maxIdx = Math.max(maxIdx, Number(m[1]));
  }

  // if base uses unnumbered 'key'/'value', next pair starts at 2
  for (let i = 2; i <= maxIdx; i++){
    eff.push({ name:`key${i}`, type:'any', optional:true });
    eff.push({ name:`value${i}`, type:'any', optional:true });
  }
  return eff;
}

/**
 * Build a .node element from a definition.
 * @param {object} def {id,name,category,kind,inputs,outputs}
 * @param {{preview?:boolean, params?:object, nid?:string|null}} options
 */
export function buildNodeDOM(def, options = {}){
  const { preview = false, params = {}, nid = null } = options;

  const node = document.createElement('div');
  node.className = 'node';
  if (nid) node.dataset.nid = nid;

  const header = document.createElement('div');
  header.className = 'header';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = def?.name || def?.id || 'Node';
  header.appendChild(title);

  // Always show "+" on Make Map nodes. nid is resolved at click.
  if (isMakeMapDef(def) && !preview){
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'icon-btn add-pair';
    addBtn.title = 'Add key/value pair';
    addBtn.textContent = '+';
    addBtn.addEventListener('mousedown', e => e.stopPropagation());
    addBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const nodeEl = addBtn.closest('.node');
      const nodeId = nodeEl?.dataset?.nid || null;
      if (!nodeId) return;
      // Emit global event; interactions.js will mutate params and re-render.
      window.dispatchEvent(new CustomEvent('makeMap:addPair', { detail:{ nid: nodeId } }));
    });
    header.appendChild(addBtn);
  }

  node.appendChild(header);

  const pins = document.createElement('div');
  pins.className = 'pins';

  // Use augmented inputs for makeMap so extra pairs from params render as pins
  const effInputs = augmentedInputsForMakeMap(def, params);

  const inExec  = execPins(effInputs || []);
  const inData  = dataPins(effInputs || []);
  const outExec = execPins(def?.outputs || []);
  const outData = dataPins(def?.outputs || []);

  const hasInputs = (inExec.length + inData.length) > 0;

  if (!hasInputs && String(def?.kind) === 'event'){
    node.classList.add('outputs-only');
    const outputs = document.createElement('div');
    outputs.className = 'side outputs';
    for (const p of [...outExec, ...outData]) outputs.appendChild(mkPin('right', p));
    pins.appendChild(outputs);
    node.appendChild(pins);
    return node;
  }

  const inputs = document.createElement('div');
  inputs.className = 'side inputs';
  for (const p of [...inExec, ...inData]){
    const el = mkPin('left', p);
    if (p.type !== 'exec' && shouldRenderControl(p.type)) el.appendChild(mkLiteral(preview, params, p));
    inputs.appendChild(el);
  }

  const outputs = document.createElement('div');
  outputs.className = 'side outputs';
  for (const p of [...outExec, ...outData]) outputs.appendChild(mkPin('right', p));

  pins.appendChild(inputs);
  pins.appendChild(outputs);
  node.appendChild(pins);

  return node;
}
