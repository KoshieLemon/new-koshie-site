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

  const jack = document.createElement('span');
  jack.className = 'jack';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = pinDef.name;

  if (side === 'right') { el.appendChild(label); el.appendChild(jack); }
  else { el.appendChild(jack); el.appendChild(label); }

  return el;
}

function mkLiteral(preview, paramsRef, pinDef){
  const wrap = document.createElement('div');
  wrap.className = 'literal-wrap';
  let input;

  if (pinDef.type === 'boolean'){
    input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'pin-input';
    input.checked = !!(paramsRef?.[pinDef.name]);
  } else {
    input = document.createElement('input');
    input.type = (pinDef.type === 'number' || pinDef.type === 'float' || pinDef.type === 'int') ? 'number' : 'text';
    input.placeholder = pinDef.type || 'string';
    input.value = paramsRef?.[pinDef.name] ?? '';
    input.className = 'literal pin-input';
  }

  if (preview){
    input.disabled = true;
  } else {
    // Ensure inputs are interactive: do not start node drag.
    input.addEventListener('mousedown', e => e.stopPropagation());
    // Enter commits and exits edit mode.
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter'){
        e.preventDefault();
        e.stopPropagation();
        input.blur();
      }
    });
    // Right-click inside input should not open node context menu.
    input.addEventListener('contextmenu', e => e.stopPropagation());
  }

  wrap.appendChild(input);
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
  node.appendChild(header); // subtitle removed intentionally

  const pins = document.createElement('div');
  pins.className = 'pins';

  const inputs = document.createElement('div');
  inputs.className = 'side inputs';
  const inExec = execPins(def?.inputs || []);
  const inData = dataPins(def?.inputs || []);
  for (const p of [...inExec, ...inData]){
    const el = mkPin('left', p);
    if (p.type !== 'exec'){
      el.appendChild(mkLiteral(preview, params, p));
    }
    inputs.appendChild(el);
  }

  const outputs = document.createElement('div');
  outputs.className = 'side outputs';
  const outExec = execPins(def?.outputs || []);
  const outData = dataPins(def?.outputs || []);
  for (const p of [...outExec, ...outData]){
    outputs.appendChild(mkPin('right', p));
  }

  pins.appendChild(inputs);
  pins.appendChild(outputs);
  node.appendChild(pins);

  return node;
}