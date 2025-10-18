// variables-render.js
// Rendering and UI assembly for chips and grouped sections.

import { VDock, typeColor, mix, cleanLabelToVarName, uniqueName } from './variables-ctx.js';
import { varTypeForChannel } from './variables-api.js';

// Collapsible group header with persisted state + improved visuals
function groupHeader(title, storageKey){
  const h = document.createElement('div');
  h.className = 'group-title';
  Object.assign(h.style, {
    display:'flex', alignItems:'center', gap:'8px',
    padding:'8px 10px', cursor:'pointer', userSelect:'none',
    color:'#cbd5e1', borderBottom:'1px solid #1f2937',
    background:'linear-gradient(180deg,#0b1018,#0a0f19)'
  });

  const chev = document.createElement('span');
  chev.className = 'chev';
  chev.textContent = '▾';
  Object.assign(chev.style, { transition:'transform .16s ease', display:'inline-block' });

  const lbl = document.createElement('span');
  lbl.textContent = title;
  Object.assign(lbl.style, { fontWeight:'600', letterSpacing:'0.2px' });

  h.append(chev, lbl);

  const collapsed0 = localStorage.getItem(storageKey) === '1';
  if (collapsed0){
    h.classList.add('collapsed');
    chev.style.transform = 'rotate(-90deg)';
  }

  h.addEventListener('click', ()=>{
    const collapsed = h.classList.toggle('collapsed');
    const next = h.nextElementSibling;
    if (next) next.style.display = collapsed ? 'none' : '';
    chev.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    localStorage.setItem(storageKey, collapsed ? '1' : '0');
  });
  return h;
}

function chipsRow(){
  const row = document.createElement('div');
  Object.assign(row.style, {
    display:'flex',
    flexWrap:'wrap',
    gap:'6px',
    padding:'8px 10px'
  });
  return { row, append: (el)=> row.appendChild(el) };
}

export function mkVarChip(v, idx, opts, deps){
  const { openTypePickerFor, addVar, removeVar } = deps;

  const chip = document.createElement('div');
  chip.className = 'chip var' + (opts.readonly ? ' inherited' : '');
  chip.draggable = true;
  chip.dataset.idx = String(idx);

  // Robust compact styling that survives DOM hide/show
  Object.assign(chip.style, {
    display:'inline-flex',
    alignItems:'center',
    width:'auto',
    maxWidth:'100%',
    flex:'0 0 auto',
    padding:'6px 10px',
    gap:'8px',
    border:'1px solid #1f2837',
    borderRadius:'9999px',
    background: mix(typeColor(v.type), '#0b1016', 0.82),
    borderColor: mix(typeColor(v.type), '#1b2330', 0.62),
    boxShadow:'0 1px 0 rgba(0,0,0,.3)',
    cursor:'grab',
    transition:'background .12s ease,border-color .12s ease'
  });

  chip.onmouseenter = ()=> chip.style.background = mix(typeColor(v.type), '#0f1724', 0.76);
  chip.onmouseleave = ()=> chip.style.background = mix(typeColor(v.type), '#0b1016', 0.82);

  const dot = document.createElement('span');
  dot.className = 'dot';
  Object.assign(dot.style, {
    width:'8px', height:'8px', borderRadius:'50%',
    background: typeColor(v.type), flex:'0 0 auto'
  });

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = v.name || '';
  Object.assign(name.style, {
    color:'#e5e7eb',
    fontWeight:'600',
    whiteSpace:'nowrap',
    overflow:'hidden',
    textOverflow:'ellipsis',
    maxWidth:'160px', // prevents “long bar” expansion
    lineHeight:'1.1'
  });

  const type = document.createElement('span');
  type.className = 'type';
  type.textContent = v.type || 'string';
  Object.assign(type.style, {
    fontSize:'12px',
    color:'#cbd5e1',
    padding:'2px 6px',
    borderRadius:'9999px',
    background:'rgba(15,23,42,.66)',
    border:'1px solid #1f2937'
  });

  const lock = document.createElement('span');
  lock.textContent = '🔒';
  Object.assign(lock.style, { fontSize:'12px', opacity:0.9, display: opts.readonly ? 'inline' : 'none' });

  const x = document.createElement('button');
  x.className = 'x';
  x.textContent = '×';
  x.title = opts.readonly ? '' : 'Delete';
  Object.assign(x.style, {
    cursor: opts.readonly ? 'default' : 'pointer',
    color:'#93a1b8',
    fontWeight:'700',
    border:'0',
    background:'transparent',
    display: opts.readonly ? 'none' : 'inline',
    padding:'0 2px'
  });

  chip.addEventListener('dragstart', (e)=>{
    chip.classList.add('dragging');
    try{
      // Treat EVERYTHING like a variable for DnD. Locking only affects editability.
      const varName = cleanLabelToVarName(v.name);
      e.dataTransfer.setData('text/x-node-id', 'get.variable');
      e.dataTransfer.setData('application/x-node-params', JSON.stringify({
        name: varName,
        type: v.type,
        readonly: !!opts.readonly,
        id: opts.id || null
      }));
      e.dataTransfer.setData('text/plain', varName);
    }catch{}
  });
  chip.addEventListener('dragend', ()=> chip.classList.remove('dragging'));

  chip.addEventListener('click', async (e)=>{
    if (e.target === x || e.target === type) return;
    // Copy a useful identifier on click
    const text = opts.id ? String(opts.id) : String(v.name);
    try{ await navigator.clipboard.writeText(text); }catch{}
  });

  chip.addEventListener('dblclick', ()=>{
    if (opts.readonly){
      // Locked chips: no rename/type edits and no cloning. Keep behavior consistent.
      return;
    }
    // Editable user variable: inline rename
    chip.classList.add('editing');
    const input = document.createElement('input');
    input.className = 'rename';
    Object.assign(input.style, {
      background:'#0b1016', color:'#e5e7eb', border:'1px solid #1f2937',
      borderRadius:'6px', padding:'4px 6px', width:'160px'
    });
    input.value = v.name || '';
    const finish = (commit)=>{
      chip.classList.remove('editing');
      const nv = commit ? input.value.trim() : v.name;
      if (commit && nv && nv !== v.name){
        const taken = new Set(VDock.VARS.map(z=>z.name));
        v.name = uniqueName(nv, taken);
        deps.setVarsDirty(true);
        deps.renderDock();
      }
      input.replaceWith(name); name.textContent = v.name;
    };
    input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', ()=> finish(true));
    name.replaceWith(input); input.focus(); input.select();
  });

  if (!opts.readonly){
    type.title = 'Click to change type';
    type.addEventListener('click', (ev)=> openTypePickerFor(idx, ev.clientX, ev.clientY));
    x.addEventListener('click', ()=> removeVar(idx));
  }

  chip.append(dot, name, type, lock, x);
  return chip;
}

export function renderDock(){
  const { els, VARS, FULL } = VDock;
  const q = (els.search?.value || '').trim().toLowerCase();
  const groups = new Map();

  // user variables
  VARS.forEach((vv, idx)=>{
    const hay = `${vv.name} ${vv.type}`.toLowerCase();
    if (q && !hay.includes(q)) return;
    const t = vv.type || 'string';
    (groups.get(t) || groups.set(t, { user: [], inh: [] }).get(t)).user.push({ v: vv, idx });
  });

  // inherited channels and roles → behave like locked variables
  const chans = FULL.channels.map(c => ({
    name: (c.type===2?'🔊 ':'# ') + c.name,
    id: c.id,
    type: varTypeForChannel(c)
  }));
  const roles = FULL.roles.map(r => ({
    name: r.name,
    id: r.id,
    type: 'Role'
  }));

  for (const item of [...chans, ...roles]){
    const hay = `${item.name} ${item.type}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    (groups.get(item.type) || groups.set(item.type, { user: [], inh: [] }).get(item.type))
      .inh.push(item);
  }

  els.list.replaceChildren();

  const types = Array.from(groups.keys()).sort((a,b)=> a.localeCompare(b));
  for (const type of types){
    const data = groups.get(type); if (!data) continue;

    const header = groupHeader(type, `dock.group.${type}`);
    const { row, append } = chipsRow();

    // Editable user vars
    for (const it of data.user){
      append(mkVarChip(it.v, it.idx, { readonly:false }, depsForRender()));
    }

    // Locked imported vars
    for (const it of data.inh){
      append(mkVarChip({ name: it.name, type }, -1, { readonly:true, id: it.id }, depsForRender()));
    }

    if (header.classList.contains('collapsed')) row.style.display='none';
    els.list.append(header, row);
  }
}

// Small dep injector so mkVarChip can call back into orchestrator
function depsForRender(){
  return {
    openTypePickerFor: (idx, x, y)=> window.__VDock_openTypePicker(idx, x, y),
    addVar: (v)=> window.__VDock_addVar(v),
    removeVar: (idx)=> window.__VDock_removeVar(idx),
    setVarsDirty: (d)=> window.__VDock_setVarsDirty(d),
    renderDock: ()=> renderDock()
  };
}
