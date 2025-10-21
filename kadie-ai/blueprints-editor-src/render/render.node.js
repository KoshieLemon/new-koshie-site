import { ensureTypeStylesInjected, colorKeyFor, cssToken } from './render.types.js';
import { openEmojiPicker } from '../menus/emoji-picker.js';
import { state } from '../core/state.js';

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
    const w = Math.min(420, Math.max(60, el.scrollWidth + 16));
    el.style.width = `${w}px`;
  } else {
    const tmp = document.createElement('span');
    tmp.style.visibility='hidden';
    tmp.style.position='fixed';
    tmp.style.whiteSpace='pre';
    tmp.style.font = getComputedStyle(el).font;
    tmp.textContent = el.value || '';
    document.body.appendChild(tmp);
    const w = Math.min(420, Math.max(60, tmp.getBoundingClientRect().width + 20));
    document.body.removeChild(tmp);
    el.style.width = `${w}px`;
  }
}

function applySavedSizeTo(el, nid, pinName){
  try{
    const n = state?.nodes?.get?.(nid);
    const sz = n?._ui?.literals?.[pinName];
    if (!sz) return;
    if (sz.w) el.style.width  = `${sz.w}px`;
    if (sz.h) el.style.height = `${sz.h}px`;
  }catch{}
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
  return k === 'number' || k === 'string' || k === 'date' || isIdLike(t) || String(t) === 'Emoji' || String(t) === 'Role';
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

// ---------- makeMap helpers (kept) ----------
function isMakeMapDef(def){
  const id = String(def?.id || '');
  const nm = String(def?.name || '');
  return id === 'makeMap' || id === 'utils.makeMap' || /(^|\s)make\s*map/i.test(nm);
}
function augmentedInputsForMakeMap(def, params){
  const base = Array.isArray(def?.inputs) ? def.inputs : [];
  if (!isMakeMapDef(def)) return base;
  const eff = base.slice();
  const hasKey1 = base.some(p => p?.name === 'key1');
  const hasVal1 = base.some(p => p?.name === 'value1');
  const baseKey = hasKey1 ? 'key1' : (base.some(p=>p?.name==='key') ? 'key' : null);
  const baseVal = hasVal1 ? 'value1' : (base.some(p=>p?.name==='value') ? 'value' : null);
  if (!baseKey || !baseVal) return eff;
  let maxIdx = 1;
  for (const k of Object.keys(params||{})){
    let m = /^key(\d+)$/.exec(k); if (m) maxIdx = Math.max(maxIdx, Number(m[1]));
    m = /^value(\d+)$/.exec(k);   if (m) maxIdx = Math.max(maxIdx, Number(m[1]));
  }
  for (let i = 2; i <= maxIdx; i++){
    eff.push({ name:`key${i}`, type:'any', optional:true });
    eff.push({ name:`value${i}`, type:'any', optional:true });
  }
  return eff;
}

// ---------- makeArray helpers (new) ----------
function isMakeArrayDef(def){
  const id = String(def?.id || '');
  const nm = String(def?.name || '');
  return id === 'flow.makeArray' || /(^|\s)make\s*array/i.test(nm);
}
function augmentedInputsForMakeArray(def, params){
  const base = Array.isArray(def?.inputs) ? def.inputs : [];
  if (!isMakeArrayDef(def)) return base;
  const eff = base.slice();
  const hasItem1 = base.some(p => p?.name === 'item1') || base.some(p => p?.name === 'item');
  if (!hasItem1) return eff;
  let maxIdx = 1;
  for (const k of Object.keys(params||{})){
    const m = /^item(\d+)$/.exec(k);
    if (m) maxIdx = Math.max(maxIdx, Number(m[1]));
  }
  for (let i = 2; i <= maxIdx; i++){
    eff.push({ name:`item${i}`, type:'any', optional:true });
  }
  return eff;
}

// Combine both augmentations
function augmentedInputs(def, params){
  const mapAug = augmentedInputsForMakeMap(def, params);
  return augmentedInputsForMakeArray({ ...def, inputs: mapAug }, params);
}

// ---- dynamic outputs (render-time) ----
function applyDynamicOutputs(def, params){
  const dyn = def?.ui?.dynamicOutputFromParam;
  if (!dyn || !dyn.param || !dyn.pin) return (def?.outputs || []);
  const chosen = String(params?.[dyn.param] || '').trim();
  if (!chosen) return (def?.outputs || []);
  return (def?.outputs || []).map(p => {
    if (p.name !== dyn.pin) return p;
    return { ...p, type: chosen };
  });
}

function signalNodeDocs(nodeId){
  try{
    const payload = { type:'kadie:open-node-docs', nodeId: String(nodeId || '') };
    window?.parent?.postMessage(payload, '*');
  }catch{}
}

// ------- Role dropdown helpers -------
function activeGuildId(){
  try{
    return (window?.KADIE?.guildId)
        || (document.body?.dataset?.guildId)
        || new URL(window.location.href).searchParams.get('guild_id')
        || new URL(window.location.href).searchParams.get('gid')
        || window.__ACTIVE_GUILD_ID__
        || null;
  }catch{ return null }
}
async function loadRolesForGuild(gid){
  if (!gid) return [];
  try{
    const res = await fetch(`/runtime/guilds/${encodeURIComponent(gid)}/roles`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (Array.isArray(data.roles) ? data.roles : []);
  }catch{ return [] }
}
// -------------------------------------

function mkLiteral(preview, paramsRef, pinDef, nid){
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
    applySavedSizeTo(sel, nid, pinDef.name);
    input = sel;
  } else if (key === 'boolean'){
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'pin-input';
    chk.checked = !!(paramsRef?.[pinDef.name]);
    if (preview) chk.disabled = true;
    applySavedSizeTo(chk, nid, pinDef.name);
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
    applySavedSizeTo(txt, nid, pinDef.name);
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
  } else if (rawType === 'date' || key === 'date'){
    const dt = document.createElement('input');
    dt.type = 'date';
    dt.className = 'literal pin-input';
    dt.value = paramsRef?.[pinDef.name] ?? '';
    applySavedSizeTo(dt, nid, pinDef.name);
    if (preview) dt.disabled = true;
    input = dt;
  } else if (rawType === 'Emoji'){
    const row = document.createElement('div');
    row.style.display = 'inline-flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';

    const disp = document.createElement('input');
    disp.type = 'text';
    disp.className = 'literal pin-input';
    disp.readOnly = true;
    disp.style.cursor = 'default';
    disp.value = '';

    const cur = paramsRef?.[pinDef.name];
    if (cur && typeof cur === 'object'){
      disp.value = cur.type === 'unicode' ? String(cur.value||'') : (cur.name ? `:${cur.name}:` : '');
      try { disp.dataset.jsonValue = JSON.stringify(cur); } catch {}
      disp.title = cur.type === 'custom' ? (cur.name || '') : (cur.value || '');
    } else if (typeof cur === 'string'){
      disp.value = cur;
    }
    autosize(disp);
    applySavedSizeTo(disp, nid, pinDef.name);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Pick';
    btn.className = 'icon-btn';
    btn.title = 'Pick emoji';
    btn.style.height = '22px';
    btn.style.lineHeight = '20px';

    if (preview){
      btn.disabled = true;
      disp.disabled = true;
    } else {
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const guessGuildId = (window?.KADIE?.guildId) ||
                             (document.body?.dataset?.guildId) ||
                             new URL(window.location.href).searchParams.get('guild_id') ||
                             new URL(window.location.href).searchParams.get('gid') ||
                             window.__ACTIVE_GUILD_ID__ ||
                             null;

        openEmojiPicker({
          anchor: btn,
          guildId: guessGuildId,
          onPick: (picked)=>{
            try { disp.dataset.jsonValue = JSON.stringify(picked); } catch { delete disp.dataset.jsonValue; }
            disp.value = picked.type === 'unicode'
              ? String(picked.value || '')
              : (picked.name ? `:${picked.name}:` : (picked.id ? `:${picked.id}:` : ''));
            disp.title = picked.type === 'custom' ? (picked.name || '') : (picked.value || '');
            autosize(disp);
            disp.dispatchEvent(new Event('input', { bubbles:true }));
            disp.dispatchEvent(new Event('change', { bubbles:true }));
          }
        });
      });
    }

    row.appendChild(disp);
    row.appendChild(btn);
    input = row;
  } else if (rawType === 'Role'){
    const sel = document.createElement('select');
    sel.className = 'literal pin-input';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a role…';
    sel.appendChild(ph);

    const cur = paramsRef?.[pinDef.name];
    const currentId = cur && typeof cur === 'object' ? String(cur.id || '') : (cur ? String(cur) : '');

    // lazy-load roles when focused
    let loaded = false;
    const ensureLoaded = async ()=>{
      if (loaded) return;
      loaded = true;
      const gid = activeGuildId();
      const roles = await loadRolesForGuild(gid);
      // clear and repopulate
      sel.innerHTML = '';
      const ph2 = document.createElement('option');
      ph2.value = '';
      ph2.textContent = roles.length ? 'Select a role…' : 'No roles';
      sel.appendChild(ph2);
      for (const r of roles){
        const o = document.createElement('option');
        o.value = String(r.id);
        o.textContent = String(r.name || '');
        o.dataset.jsonValue = JSON.stringify({ id: String(r.id), name: String(r.name || '') });
        sel.appendChild(o);
      }
      if (currentId) sel.value = currentId;
    };

    sel.addEventListener('focus', ensureLoaded, { once: true });
    sel.addEventListener('mousedown', ensureLoaded, { once: true });

    // propagate selection as JSON payload {id,name}
    sel.addEventListener('change', ()=>{
      const opt = sel.selectedOptions?.[0];
      if (!opt || !opt.value){
        delete sel.dataset.jsonValue;
        sel.value = '';
        return;
      }
      try{
        const payload = opt.dataset.jsonValue
          ? JSON.parse(opt.dataset.jsonValue)
          : { id: opt.value, name: opt.textContent || '' };
        sel.dataset.jsonValue = JSON.stringify(payload);
      }catch{
        delete sel.dataset.jsonValue;
      }
    });

    if (currentId) sel.value = currentId;
    applySavedSizeTo(sel, nid, pinDef.name);
    input = sel;
  } else {
    const ta = document.createElement('textarea');
    ta.rows = 1;
    ta.className = 'literal pin-input';
    ta.value = paramsRef?.[pinDef.name] ?? '';
    autosize(ta);
    applySavedSizeTo(ta, nid, pinDef.name);
    if (!preview){
      ta.addEventListener('input', ()=> autosize(ta));
      ta.addEventListener('paste', ()=> requestAnimationFrame(()=> autosize(ta)));
    } else {
      ta.disabled = true;
    }
    input = ta;
  }

  if (!preview){
    const attachTo = input.querySelector?.('.pin-input') || input;
    attachTo.addEventListener('mousedown', e => e.stopPropagation());
    attachTo.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.stopPropagation(); } });
    attachTo.addEventListener('contextmenu', e => e.stopPropagation());
  }

  wrap.appendChild(input);
  return wrap;
}

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

  if (!preview){
    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'icon-btn';
    infoBtn.title = 'Open node docs';
    infoBtn.textContent = 'i';
    infoBtn.style.borderRadius = '50%';
    infoBtn.style.marginLeft = 'auto';
    infoBtn.addEventListener('mousedown', e => e.stopPropagation());
    infoBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = String(def?.id || def?.name || '');
      if (id) {
        try{
          const payload = { type:'kadie:open-node-docs', nodeId: id };
          window?.parent?.postMessage(payload, '*');
        }catch{}
      }
    });
    header.appendChild(infoBtn);
  }

  // Existing: makeMap '+' button
  if (isMakeMapDef(def) && !preview){
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'icon-btn add-pair';
    addBtn.title = 'Add key/value pair';
    addBtn.textContent = '+';
    addBtn.style.marginLeft = '6px';
    addBtn.addEventListener('mousedown', e => e.stopPropagation());
    addBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const nodeEl = addBtn.closest('.node');
      const nodeId = nodeEl?.dataset?.nid || null;
      if (!nodeId) return;
      window.dispatchEvent(new CustomEvent('makeMap:addPair', { detail:{ nid: nodeId } }));
    });
    header.appendChild(addBtn);
  }

  // New: makeArray '+' button
  if (isMakeArrayDef(def) && !preview){
    const addBtnArr = document.createElement('button');
    addBtnArr.type = 'button';
    addBtnArr.className = 'icon-btn add-item';
    addBtnArr.title = 'Add item';
    addBtnArr.textContent = '+';
    addBtnArr.style.marginLeft = '6px';
    addBtnArr.addEventListener('mousedown', e => e.stopPropagation());
    addBtnArr.addEventListener('click', (e)=>{
      e.stopPropagation();
      const nodeEl = addBtnArr.closest('.node');
      const nodeId = nodeEl?.dataset?.nid || null;
      if (!nodeId) return;
      window.dispatchEvent(new CustomEvent('makeArray:addItem', { detail:{ nid: nodeId } }));
    });
    header.appendChild(addBtnArr);
  }

  node.appendChild(header);

  const pins = document.createElement('div');
  pins.className = 'pins';

  // Dynamic inputs for makeMap and makeArray
  const effInputs = augmentedInputs(def, params);

  const inExec  = execPins(effInputs || []);
  const inData  = dataPins(effInputs || []);

  const outputsEffective = applyDynamicOutputs(def, params);
  const outExec = execPins(def?.outputs || []);
  const outData = dataPins(outputsEffective);

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
    if (p.type !== 'exec' && shouldRenderControl(p.type)) el.appendChild(mkLiteral(preview, params, p, nid));
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
