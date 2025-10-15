// Universal node DOM builder with compact literals and no-inputs layout.
import { ensureTypeStylesInjected, colorKeyFor, cssToken } from './render.types.js';
import { drawWires } from './render.wires.js';

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

function mkLiteral(preview, paramsRef, pinDef){
  const wrap = document.createElement('div');
  wrap.className = 'literal-wrap';

  // checkbox as-is
  if (pinDef.type === 'boolean'){
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'pin-input';
    input.checked = !!(paramsRef?.[pinDef.name]);
    if (!preview){
      input.addEventListener('mousedown', e => e.stopPropagation());
      input.addEventListener('contextmenu', e => e.stopPropagation());
    } else input.disabled = true;
    wrap.appendChild(input);
    return wrap;
  }

  // compact square → grow width a bit → wrap and grow downward
  const ta = document.createElement('textarea');
  ta.className = 'literal pin-input';
  ta.value = paramsRef?.[pinDef.name] ?? '';
  ta.placeholder = '';           // no placeholder text
  ta.rows = 1;
  ta.wrap = 'soft';
  ta.spellcheck = false;
  ta.autocapitalize = 'off';
  ta.autocomplete = 'off';
  ta.style.resize = 'none';

  if (preview) {
    ta.disabled = true;
  } else {
    ta.addEventListener('mousedown', e => e.stopPropagation());
    ta.addEventListener('contextmenu', e => e.stopPropagation());
  }

  const MIN = 18, MAXW = 220, MAXH = 160;
  function autosize(){
    const has = ta.value.length>0 || document.activeElement===ta;
    ta.classList.toggle('expanded', has);
    if (!has){
      ta.style.width  = MIN + 'px';
      ta.style.height = MIN + 'px';
      requestAnimationFrame(drawWires);
      return;
    }
    // width grows up to MAXW, then wrap and grow height
    ta.style.width = '0px';
    ta.style.height = 'auto';
    ta.style.width  = Math.min(MAXW, Math.max(64, ta.scrollWidth + 8)) + 'px';
    ta.style.height = Math.min(MAXH, Math.max(MIN, ta.scrollHeight)) + 'px';
    requestAnimationFrame(drawWires);
  }
  ['input','focus','blur'].forEach(ev => ta.addEventListener(ev, autosize));
  queueMicrotask(autosize);

  wrap.appendChild(ta);
  return wrap;
}

/**
 * Build a .node element from a definition.
 * @param {object} def {id,name,inputs,outputs}
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

  const inputs = document.createElement('div');
  inputs.className = 'side inputs';
  const inExec = execPins(def?.inputs || []);
  const inData = dataPins(def?.inputs || []);
  for (const p of [...inExec, ...inData]){
    const el = mkPin('left', p);
    if (p.type !== 'exec') el.appendChild(mkLiteral(preview, params, p));
    inputs.appendChild(el);
  }

  const outputs = document.createElement('div');
  outputs.className = 'side outputs';
  const outExec = execPins(def?.outputs || []);
  const outData = dataPins(def?.outputs || []);
  for (const p of [...outExec, ...outData]) outputs.appendChild(mkPin('right', p));

  const hasInputs = (inExec.length + inData.length) > 0;
  if (!hasInputs){
    // one-column layout when no inputs (events)
    node.classList.add('no-inputs');
    inputs.style.display = 'none';
  }

  pins.appendChild(inputs);
  pins.appendChild(outputs);
  node.appendChild(pins);

  return node;
}
