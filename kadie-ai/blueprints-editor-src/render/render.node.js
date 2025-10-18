// Universal node DOM builder used by both editor and menus.
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

function isIdLike(t){ return /Id$/.test(String(t||'')) || colorKeyFor(t) === 'snowflake'; }
function shouldRenderControl(t){
  const k = colorKeyFor(t || 'string');
  if (k === 'boolean') return true;
  return k === 'number' || k === 'string' || isIdLike(t);
}

// sanitize numeric text: keep digits; allow one dot if float; strip commas/spaces/extra dots
function cleanNumeric(v, allowDot){
  if (v == null) return '';
  let s = String(v);
  s = s.replace(/[, _]/g, '');          // remove separators
  s = s.replace(/[^\d.]/g, '');         // keep digits and dots
  if (!allowDot) s = s.replace(/\./g, ''); // ints: no dots
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
  let input;

  if (key === 'boolean'){
    input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'pin-input';
    input.checked = !!(paramsRef?.[pinDef.name]);
  } else if (key === 'number'){
    // Allow free typing while focused; normalize on blur only.
    const allowDot = String(rawType).toLowerCase() !== 'int';
    input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.pattern = '[0-9.]*';
    input.className = 'literal pin-input';
    input.value = paramsRef?.[pinDef.name] ?? '';
    autosize(input);
    if (!preview){
      input.addEventListener('input', ()=> autosize(input)); // no sanitizing while typing
      input.addEventListener('blur', ()=>{
        input.value = cleanNumeric(input.value, allowDot);
        autosize(input);
      });
      input.addEventListener('paste', ()=> { requestAnimationFrame(()=> autosize(input)); });
    }
  } else {
    // strings and IDs use textarea that grows
    const ta = document.createElement('textarea');
    ta.rows = 1;
    ta.maxLength = 100;
    ta.className = 'literal pin-input';
    ta.value = paramsRef?.[pinDef.name] ?? '';
    autosize(ta);
    if (!preview){
      ta.addEventListener('input', ()=> autosize(ta));
    }
    input = ta;
  }

  if (preview){
    input.disabled = true;
  } else {
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.stopPropagation(); } });
    input.addEventListener('contextmenu', e => e.stopPropagation());
  }

  wrap.appendChild(input);
  return wrap;
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
  node.appendChild(header);

  const pins = document.createElement('div');
  pins.className = 'pins';

  const inExec = execPins(def?.inputs || []);
  const inData = dataPins(def?.inputs || []);
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
