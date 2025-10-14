// /kadie-ai/blueprints-editor-src/variables-dock.js
/* eslint-disable no-console */
import { BOT_BASE, gid } from './config.js';
import { TYPE_COLORS, colorKeyFor } from './render.types.js';

(function init(){
  const els = {
    dock: document.getElementById('varsDock'),
    resizer: document.querySelector('#varsDock .resizer'),
    list: document.getElementById('dockList'),
    addBtn: document.getElementById('varsAdd'),
    editor: document.getElementById('editor'),
    search: document.getElementById('dockSearch'),
  };
  if (!els.dock || !els.list || !els.addBtn || !els.editor){
    console.warn('[variables-dock] required DOM missing'); return;
  }

  // ---------- width resize (right-anchored) ----------
  const KEY_W = 'kadie.varsDock.width';
  const MIN_W = 240, MAX_W = 640;
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
  const savedW = Number(localStorage.getItem(KEY_W) || 0);
  if (savedW) els.dock.style.width = `${clamp(savedW, MIN_W, MAX_W)}px`;

  if (els.resizer){
    let active = false;
    const onMove = (e)=>{
      if (!active) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      const fromRight = window.innerWidth - x - parseFloat(getComputedStyle(els.dock).right || '12');
      const w = clamp(fromRight, MIN_W, MAX_W);
      els.dock.style.width = `${w}px`;
    };
    const onUp = ()=>{
      if (!active) return;
      active = false; els.dock.classList.remove('resizing');
      localStorage.setItem(KEY_W, String(parseFloat(els.dock.style.width) || 0));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
    const onDown = (e)=>{
      active = true; els.dock.classList.add('resizing');
      window.addEventListener('mousemove', onMove, {passive:false});
      window.addEventListener('touchmove', onMove, {passive:false});
      window.addEventListener('mouseup', onUp, {passive:true});
      window.addEventListener('touchend', onUp, {passive:true});
      e.preventDefault();
    };
    els.resizer.addEventListener('mousedown', onDown);
    els.resizer.addEventListener('touchstart', onDown, { passive:false });
  }

  // keep dock height in sync with editor
  function ensureHeight(){
    const h = els.editor?.getBoundingClientRect().height || Math.round(window.innerHeight * 0.68);
    els.dock.style.maxHeight = `${h}px`;
    els.dock.style.height = `${h}px`;
    els.dock.style.overflow = 'auto';
  }
  ensureHeight();
  window.addEventListener('resize', ensureHeight);

  // ---------- variable storage (per-blueprint) ----------
  function currentBlueprintId(){
    const sel = document.getElementById('bpSelect');
    return sel && sel.value ? String(sel.value) : null;
  }
  function storeKey(){
    const bp = currentBlueprintId();
    return bp ? `kadie.vars.${bp}` : 'kadie.vars._global';
  }
  function loadVars(){
    try{
      const s = localStorage.getItem(storeKey());
      const arr = s ? JSON.parse(s) : [];
      return Array.isArray(arr) ? arr : [];
    }catch{ return []; }
  }
  function saveVars(arr){
    try{ localStorage.setItem(storeKey(), JSON.stringify(arr)); }catch{}
  }

  const TYPE_OPTIONS = Object.keys(TYPE_COLORS);
  const typeColor = (t)=> TYPE_COLORS[colorKeyFor(t || 'string')] || '#a3a3a3';

  // ---------- variable chips ----------
  function mkVarChip(v, idx){
    const chip = document.createElement('div');
    chip.className = 'chip var';
    chip.draggable = true;
    chip.dataset.idx = String(idx);

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = typeColor(v.type);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = v.name || '';

    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = v.type || 'string';
    type.title = 'Click to change type';

    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = 'Delete';

    // drag to graph (optional "get.variable" node)
    chip.addEventListener('dragstart', (e)=>{
      chip.classList.add('dragging');
      try{
        e.dataTransfer.setData('text/x-node-id', 'get.variable');
        e.dataTransfer.setData('application/x-node-params', JSON.stringify({ name: v.name, type: v.type }));
        e.dataTransfer.setData('text/plain', v.name);
      }catch{}
    });
    chip.addEventListener('dragend', ()=> chip.classList.remove('dragging'));

    // rename inline on double-click
    chip.addEventListener('dblclick', ()=>{
      chip.classList.add('editing');
      const input = document.createElement('input');
      input.className = 'rename';
      input.value = v.name || '';
      const finish = (commit)=>{
        chip.classList.remove('editing');
        const nv = (commit ? input.value.trim() : v.name);
        if (commit && nv && nv !== v.name){ v.name = uniqueName(nv); persist(); }
        input.replaceWith(name); name.textContent = v.name;
      };
      input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
      input.addEventListener('blur', ()=> finish(true));
      name.replaceWith(input); input.focus(); input.select();
    });

    // cycle type on click
    type.addEventListener('click', ()=>{
      const i = Math.max(0, TYPE_OPTIONS.indexOf(v.type));
      const next = TYPE_OPTIONS[(i+1) % TYPE_OPTIONS.length];
      v.type = next; type.textContent = next; dot.style.background = typeColor(next);
      persist();
    });

    // copy variable name on click
    chip.addEventListener('click', async (e)=>{
      if (e.target === x || e.target === type) return;
      try{ await navigator.clipboard.writeText(v.name); }catch{}
    });

    x.addEventListener('click', ()=> removeVar(idx));

    chip.append(dot, name, type, x);
    // tint background slightly by type
    chip.style.background = mix(typeColor(v.type), '#11131a', 0.85);
    chip.style.borderColor = mix(typeColor(v.type), '#1e2230', 0.65);
    return chip;
  }

  function uniqueName(base){
    const arr = loadVars();
    const taken = new Set(arr.map(z=>z.name));
    let name = base.replace(/[^a-zA-Z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
    if (!name) name = 'Var';
    if (!taken.has(name)) return name;
    let i = 2;
    while (taken.has(`${name}_${i}`)) i++;
    return `${name}_${i}`;
  }

  function persist(){ saveVars(readVarsFromDOM()); renderDock(); }
  function readVarsFromDOM(){
    // The DOM is authoritative for order; pull values from dataset and spans.
    const out = [];
    for (const chip of els.list.querySelectorAll('.chip.var')){
      const idx = Number(chip.dataset.idx || 0);
      const name = chip.querySelector('.name')?.textContent?.trim() || '';
      const type = chip.querySelector('.type')?.textContent || 'string';
      if (!name) continue;
      out.push({ name, type });
    }
    return out;
  }

  function addVar(v){ const arr = loadVars(); arr.push(v); saveVars(arr); renderDock(); }
  function removeVar(idx){
    const arr = loadVars().filter((_,i)=> i !== idx);
    saveVars(arr); renderDock();
  }

  els.addBtn.addEventListener('click', ()=>{
    addVar({ name: uniqueName('NewVar'), type:'string' });
  });

  const sel = document.getElementById('bpSelect');
  if (sel) sel.addEventListener('change', renderDock);

  // ---------- Guild fetch and normalize ----------
  let FULL = { channels: [], roles: [] };

  const CHANNEL_URLS = gid ? [
    `${BOT_BASE}/runtime/guilds/${encodeURIComponent(gid)}/channels`,
    `${location.origin}/runtime/guilds/${encodeURIComponent(gid)}/channels`,
    `${location.origin}/api/runtime/guilds/${encodeURIComponent(gid)}/channels`,
  ] : [];
  const ROLE_URLS = gid ? [
    `${BOT_BASE}/runtime/guilds/${encodeURIComponent(gid)}/roles`,
    `${location.origin}/runtime/guilds/${encodeURIComponent(gid)}/roles`,
    `${location.origin}/api/runtime/guilds/${encodeURIComponent(gid)}/roles`,
  ] : [];

  async function fetchFirstOk(urls){
    for (const url of urls){
      try{ const r = await fetch(url, { headers:{ Accept:'application/json' } });
        if (r.ok){ const d = await r.json().catch(()=>[]); return Array.isArray(d)?d:[]; }
      }catch(_){}
    }
    return [];
  }

  function normalizeChannels(arr){
    return (arr||[]).map(c=>({
      id: String(c.id),
      name: String(c.name||'unnamed'),
      type: Number(c.type||0),
      position: Number(c.position||0),
    }));
  }
  function normalizeRoles(arr){
    return (arr||[]).map(r=>({
      id: String(r.id),
      name: String(r.name||'@unknown'),
      color: Number(r.color||0),
      position: Number(r.position||0),
    }));
  }

  function varTypeForChannel(ch){
    if (ch.type === 2) return 'VoiceBasedChannel';
    if (ch.type === 4) return 'CategoryChannel';
    return 'TextBasedChannel';
  }

  function mkGuildChip(label, id, vtype){
    const chip = document.createElement('div');
    chip.className = 'chip guild';
    chip.draggable = true;
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = typeColor(vtype);
    const name = document.createElement('span'); name.className = 'name'; name.textContent = label;
    const type = document.createElement('span'); type.className = 'type'; type.textContent = vtype;
    chip.append(dot, name, type);

    chip.style.background = mix(typeColor(vtype), '#11131a', 0.85);
    chip.style.borderColor = mix(typeColor(vtype), '#1e2230', 0.65);

    chip.addEventListener('dragstart',(e)=>{
      chip.classList.add('dragging');
      try{
        const nodeId = vtype.includes('Channel') ? 'get.channel' : 'get.role';
        e.dataTransfer.setData('text/x-node-id', nodeId);
        e.dataTransfer.setData('application/x-node-params', JSON.stringify({ id, kind: vtype }));
        e.dataTransfer.setData('text/plain', `${label} (${id})`);
      }catch{}
    });
    chip.addEventListener('dragend', ()=> chip.classList.remove('dragging'));

    // click copies ID; double-click imports as variable of that type
    chip.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(id); }catch{} });
    chip.addEventListener('dblclick', ()=>{
      addVar({ name: uniqueName(label.replace(/^[#@ ]+/, '')), type: vtype });
      // also persist the id value to clipboard for convenience
      try{ navigator.clipboard.writeText(id); }catch(_){}
    });

    return chip;
  }

  // ---------- Render unified dock ----------
  function groupHeader(title, storageKey, count){
    const h = document.createElement('div');
    h.className = 'group-title';
    const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▾';
    const lbl = document.createElement('span'); lbl.textContent = title;
    const cnt = document.createElement('span'); cnt.className = 'count'; cnt.textContent = String(count);
    h.append(chev, lbl, cnt);
    if (localStorage.getItem(storageKey) === '1'){ h.classList.add('collapsed'); }
    h.addEventListener('click', ()=>{
      const collapsed = h.classList.toggle('collapsed');
      const next = h.nextElementSibling;
      if (next) next.style.display = collapsed ? 'none' : '';
      localStorage.setItem(storageKey, collapsed ? '1' : '0');
    });
    return h;
  }

  function chipsRow(items){
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    row.style.gap = '6px';
    return { row, append: (el)=> row.appendChild(el) };
  }

  function renderDock(){
    const q = (els.search?.value || '').trim().toLowerCase();

    // variables grouped by type
    const vars = loadVars();
    const groupedVars = new Map();
    for (const v of vars){
      if (q && !`${v.name} ${v.type}`.toLowerCase().includes(q)) continue;
      const k = v.type || 'string';
      (groupedVars.get(k) || groupedVars.set(k, []).get(k)).push(v);
    }

    // guild objects grouped by variable type
    const channels = FULL.channels
      .map(c => ({ ...c, vtype: varTypeForChannel(c), label: (c.type===2?'🔊 ':'# ') + c.name }))
      .filter(c => !q || (`${c.label} ${c.vtype}`.toLowerCase().includes(q)));
    const roles = FULL.roles
      .map(r => ({ ...r, vtype: 'Role', label: r.name }))
      .filter(r => !q || (`${r.label} ${r.vtype}`.toLowerCase().includes(q)));

    const groups = [];

    // variable groups first (each type equals)
    for (const [type, items] of groupedVars){
      groups.push({
        key: `vars.${type}`,
        title: type,
        chips: () => {
          const { row, append } = chipsRow(items.length);
          items.forEach((v, i) => append(mkVarChip(v, i)));
          return row;
        }
      });
    }

    // guild groups next
    const txt = channels.filter(c=>c.vtype==='TextBasedChannel');
    const voi = channels.filter(c=>c.vtype==='VoiceBasedChannel');
    const cat = channels.filter(c=>c.vtype==='CategoryChannel');
    if (txt.length) groups.push({
      key:'guild.TextBasedChannel', title:'Text channels',
      chips:()=>{ const {row,append}=chipsRow(); txt.forEach(c=>append(mkGuildChip(`# ${c.name}`, c.id, 'TextBasedChannel'))); return row; }
    });
    if (voi.length) groups.push({
      key:'guild.VoiceBasedChannel', title:'Voice channels',
      chips:()=>{ const {row,append}=chipsRow(); voi.forEach(c=>append(mkGuildChip(`🔊 ${c.name}`, c.id, 'VoiceBasedChannel'))); return row; }
    });
    if (cat.length) groups.push({
      key:'guild.CategoryChannel', title:'Category channels',
      chips:()=>{ const {row,append}=chipsRow(); cat.forEach(c=>append(mkGuildChip(`# ${c.name}`, c.id, 'CategoryChannel'))); return row; }
    });
    if (roles.length) groups.push({
      key:'guild.Role', title:'Roles',
      chips:()=>{ const {row,append}=chipsRow(); roles.forEach(r=>append(mkGuildChip(r.name, r.id, 'Role'))); return row; }
    });

    // paint
    els.list.replaceChildren();
    for (const g of groups){
      const itemsCount = g.chipsCount || 0; // not used now
      const header = groupHeader(g.title, `dock.group.${g.key}`, itemsCount);
      const content = g.chips();
      if (header.classList.contains('collapsed')) content.style.display='none';
      els.list.append(header, content);
      // set count after content is built
      const cnt = header.querySelector('.count');
      if (cnt) cnt.textContent = String(content.children.length);
    }
  }

  // utilities
  function mix(a, b, t){
    // a,b hex colors, t in [0..1], return hex
    function hexToRgb(h){ const n=parseInt(h.slice(1),16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
    function toHex(n){ const s=n.toString(16).padStart(2,'0'); return s; }
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(A.r*(1-t)+B.r*t);
    const g = Math.round(A.g*(1-t)+B.g*t);
    const bl= Math.round(A.b*(1-t)+B.b*t);
    return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
  }

  if (els.search) els.search.addEventListener('input', renderDock);

  // initial data load
  (async function loadGuild(){
    try{
      if (gid){
        const ch = await fetchFirstOk(CHANNEL_URLS);
        const rl = await fetchFirstOk(ROLE_URLS);
        FULL.channels = normalizeChannels(ch);
        FULL.roles = normalizeRoles(rl);
        console.log('%c[variables-dock] guild loaded','color:#22c55e', { channels: FULL.channels.length, roles: FULL.roles.length });
      }
    }catch(err){
      console.error('[variables-dock] guild load failed', err);
    }finally{
      renderDock();
    }
  })();

})();
