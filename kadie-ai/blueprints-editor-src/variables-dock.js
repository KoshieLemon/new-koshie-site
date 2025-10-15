// /kadie-ai/blueprints-editor-src/variables-dock.js
/* eslint-disable no-console */
import { BOT_BASE, gid } from './config.js';
import { TYPE_COLORS, colorKeyFor } from './render.types.js';
import { markDirty, clearDirty } from './state.js';

/** All supported base types (from variable-types.txt) */
const ALL_TYPES = [
  // Primitives
  'boolean','string','int','float','number','bigint','json','buffer','stream','date',
  'timestamp_ms','duration_ms','url','color',
  // IDs (aliases of snowflake)
  'snowflake','guildId','channelId','userId','memberId','roleId','messageId','emojiId','webhookId','applicationId','interactionId',
  // Discord objects
  'Client','Guild','User','GuildMember','Role','Message','Attachment','Webhook','Invite',
  // Channels
  'TextBasedChannel','TextChannel','ThreadChannel','DMChannel','NewsChannel','ForumChannel',
  'VoiceBasedChannel','VoiceChannel','StageChannel',
  'CategoryChannel',
  // Interactions
  'Interaction','ChatInputCommandInteraction','MessageComponentInteraction','ModalSubmitInteraction','AutocompleteInteraction',
  // Message payloads
  'MessageContent','Embed','ComponentRow','AllowedMentions','MessageReference','AttachmentInput','TTS',
  // Flags
  'Permissions','IntentFlags',
];

(function init(){
  const els = {
    dock: document.getElementById('varsDock'),
    resizer: document.querySelector('#varsDock .resizer'),
    list: document.getElementById('dockList'),
    addBtn: document.getElementById('varsAdd'),
    editor: document.getElementById('editor'),
    search: document.getElementById('dockSearch'),
    saveBtn: document.getElementById('saveBtn'),
    revertBtn: document.getElementById('revertBtn'),
    dirty: document.getElementById('dirty'),
    bpSelect: document.getElementById('bpSelect'),
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

  /* ------------------------- GLOBAL VARS (server) ------------------------- */

  const VAR_URLS = gid ? [
    `${BOT_BASE}/runtime/guilds/${encodeURIComponent(gid)}/variables`,
    `${location.origin}/runtime/guilds/${encodeURIComponent(gid)}/variables`,
    `${location.origin}/api/runtime/guilds/${encodeURIComponent(gid)}/variables`,
  ] : [];

  let VARS = [];
  let SNAP = [];
  let varsDirty = false;

  function setVarsDirty(d){
    varsDirty = !!d;
    if (varsDirty) markDirty(els.dirty);
  }

  async function fetchFirstOkJson(urls){
    for (const url of urls){
      try{
        const r = await fetch(url, { headers:{ Accept:'application/json' }, method:'GET' });
        if (r.ok){ const j = await r.json().catch(()=>[]); return Array.isArray(j) ? j : []; }
        if (r.status === 404){ continue; }
      }catch(_){}
    }
    return [];
  }
  async function postFirstOk(urls, body){
    const headers = { 'content-type':'application/json', 'accept':'application/json' };
    for (const url of urls){
      try{
        const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
        if (r.ok) return true;
      }catch(_){}
    }
    return false;
  }

  const LOCAL_SNAP_KEY = 'kadie.vars._global.snap';
  function readLocalSnap(){
    try{ const s = localStorage.getItem(LOCAL_SNAP_KEY); const a = s?JSON.parse(s):[]; return Array.isArray(a)?a:[]; }catch{ return []; }
  }
  function writeLocalSnap(arr){
    try{ localStorage.setItem(LOCAL_SNAP_KEY, JSON.stringify(arr||[])); }catch{}
  }

  async function loadVarsFromServer(){
    if (!gid){ VARS = []; SNAP = []; renderDock(); return; }
    const server = await fetchFirstOkJson(VAR_URLS);
    const base = Array.isArray(server) && server.length ? server : readLocalSnap();
    SNAP = JSON.parse(JSON.stringify(base));
    VARS = JSON.parse(JSON.stringify(base));
    setVarsDirty(false);
    renderDock();
  }

  async function saveVarsToServer(){
    const ok = await postFirstOk(VAR_URLS, VARS);
    if (ok){
      SNAP = JSON.parse(JSON.stringify(VARS));
      writeLocalSnap(SNAP);
      setVarsDirty(false);
      clearDirty(els.dirty);
    } else {
      console.warn('[variables-dock] save failed on all URLs; keeping dirty state');
    }
    return ok;
  }

  /* ----------------------------- TYPE PICKER ----------------------------- */

  let typeUI = null; // {root,input,list,segSingle,segArray,segMap, openAt(), close()}
  let typeTarget = { idx: -1 };

  function ensureTypePicker(){
    if (typeUI) return typeUI;
    const root = document.createElement('div');
    root.id = 'var-type-picker';
    Object.assign(root.style, {
      position:'fixed', zIndex: 2147483647, display:'none',
      minWidth:'280px', maxWidth:'420px', maxHeight:'60vh', overflow:'auto',
      background:'#0a0f19', color:'#e5e7eb', border:'1px solid #1f2937',
      borderRadius:'10px', boxShadow:'0 14px 36px rgba(0,0,0,.6)', padding:'8px'
    });

    // Search
    const search = document.createElement('input');
    Object.assign(search.style, {
      width:'100%', boxSizing:'border-box', padding:'6px 8px',
      border:'1px solid #2b2f3a', borderRadius:'8px', background:'#0f1117', color:'#e5e7eb',
      marginBottom:'8px'
    });
    search.placeholder = 'Search types…';

    // Segmented control
    const seg = document.createElement('div');
    Object.assign(seg.style, { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'6px', marginBottom:'8px' });
    function mkSeg(text){ const b=document.createElement('button');
      b.textContent=text; Object.assign(b.style,{
        border:'1px solid #2b2f3a', background:'#11131a', color:'#e5e7eb',
        padding:'6px 8px', borderRadius:'8px', cursor:'pointer'
      }); return b; }
    const segSingle = mkSeg('Single'); const segArray = mkSeg('Array'); const segMap = mkSeg('Map');
    seg.append(segSingle, segArray, segMap);
    function setSeg(which){
      [segSingle,segArray,segMap].forEach(b=>{
        b.style.background = (b===which)?'#1d4ed8':'#11131a';
        b.style.borderColor = (b===which)?'#1e40af':'#2b2f3a';
      });
    }

    // List
    const list = document.createElement('div');
    Object.assign(list.style, { display:'grid', gridTemplateColumns:'1fr', gap:'4px' });

    function paintList(){
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      const items = ALL_TYPES.filter(t=>!q || t.toLowerCase().includes(q));
      for (const t of items){
        const btn = document.createElement('button');
        btn.textContent = t;
        Object.assign(btn.style,{
          textAlign:'left', border:'1px solid #2b2f3a', background:'#0f1117',
          color:'#e5e7eb', padding:'6px 8px', borderRadius:'8px', cursor:'pointer'
        });
        btn.onmouseenter = ()=> btn.style.background='#0c1730';
        btn.onmouseleave = ()=> btn.style.background='#0f1117';
        btn.onclick = ()=> commitTypeSelection(t);
        list.appendChild(btn);
      }
    }

    function commitTypeSelection(baseType){
      const idx = typeTarget.idx; if (idx < 0) return;
      const mode = segSingle.style.background === 'rgb(29, 78, 216)' ? 'single'
                 : segArray .style.background === 'rgb(29, 78, 216)' ? 'array'
                 : 'map';
      let final = baseType;
      if (mode === 'array') final = `${baseType}[]`;
      else if (mode === 'map') final = `map<${baseType}>`;
      if (VARS[idx]) { VARS[idx].type = final; setVarsDirty(true); renderDock(); }
      close();
    }

    // Mouse-anchored, clamped to viewport
    function openAt(clientX, clientY, currentType){
      let mode = 'single', base = currentType || 'string';
      if (currentType?.endsWith('[]')) { mode='array'; base=currentType.slice(0,-2)||'string'; }
      else if (/^map<.+>$/.test(currentType||'')) { mode='map'; base=currentType.slice(4,-1); }
      setSeg(mode==='single'?segSingle:mode==='array'?segArray:segMap);
      search.value=''; paintList();

      // measure and clamp
      root.style.left='-9999px'; root.style.top='-9999px'; root.style.display='block';
      const mw = root.offsetWidth, mh = root.offsetHeight;
      const vw = innerWidth, vh = innerHeight, pad = 8;

      let left = clientX + 12;
      let top  = clientY + 12;
      if (left + mw > vw - pad) left = clientX - mw - 12;
      if (top  + mh > vh - pad) top  = clientY - mh - 12;

      // final clamp box
      left = Math.min(vw - pad - mw, Math.max(pad, left));
      top  = Math.min(vh - pad - mh, Math.max(pad, top));

      root.style.left = `${left}px`;
      root.style.top  = `${top}px`;

      setTimeout(()=> search.focus(), 0);
    }

    function close(){
      root.style.display='none';
      // listeners are attached in openTypePickerFor and cleaned there
    }

    function outside(ev){
      if (!root.contains(ev.target)) close();
    }
    function onKey(ev){
      if (ev.key === 'Escape') close();
      if (ev.key === 'Enter'){
        const first = list.querySelector('button');
        if (first) first.click();
      }
    }

    search.addEventListener('input', paintList);
    segSingle.onclick = ()=> setSeg(segSingle);
    segArray .onclick = ()=> setSeg(segArray);
    segMap   .onclick = ()=> setSeg(segMap);

    root.append(search, seg, list);
    document.body.appendChild(root);

    typeUI = { root, input:search, list, segSingle, segArray, segMap, openAt, close, outside, onKey };
    return typeUI;
  }

  function openTypePickerFor(idx, clientX, clientY){
    const ui = ensureTypePicker();
    typeTarget.idx = idx;
    ui.openAt(clientX, clientY, VARS[idx]?.type || 'string');

    const outside = (ev)=>{ if (!ui.root.contains(ev.target)) { ui.close(); cleanup(); } };
    const onKey   = (ev)=>{ if (ev.key==='Escape') { ui.close(); cleanup(); }
                            if (ev.key==='Enter'){ const first=ui.list.querySelector('button'); if(first) first.click(); cleanup(); } };
    function cleanup(){
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', onKey, true);
    }
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', onKey, true);
  }

  /* ----------------------------- UI + behavior ---------------------------- */

  const TYPE_OPTIONS = Object.keys(TYPE_COLORS);
  const typeColor = (t)=> TYPE_COLORS[colorKeyFor(t || 'string')] || '#a3a3a3';

  function cleanLabelToVarName(label){
    return String(label || '')
      .replace(/^[#@ ]+/, '')
      .replace(/[^a-zA-Z0-9_]+/g,'_')
      .replace(/^_+|_+$/g,'') || 'Var';
  }

  // unified chip for BOTH user variables and inherited guild items
  // opts: { readonly:boolean, nodeId?:'get.channel'|'get.role', id?:string }
  function mkVarChip(v, idx, opts = {}){
    const chip = document.createElement('div');
    chip.className = 'chip var' + (opts.readonly ? ' inherited' : '');
    chip.draggable = true;
    chip.dataset.idx = String(idx);

    chip.style.width = 'auto';
    chip.style.flex = '0 0 auto';
    chip.style.padding = '6px 8px';
    chip.style.gap = '8px';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = typeColor(v.type);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = v.name || '';

    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = v.type || 'string';

    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = opts.readonly ? '' : 'Delete';
    if (opts.readonly) x.style.display = 'none';

    chip.addEventListener('dragstart', (e)=>{
      chip.classList.add('dragging');
      try{
        if (opts.nodeId && opts.id){
          e.dataTransfer.setData('text/x-node-id', opts.nodeId);
          e.dataTransfer.setData('application/x-node-params', JSON.stringify({ id: opts.id, kind: v.type }));
          e.dataTransfer.setData('text/plain', `${v.name} (${opts.id})`);
        } else {
          e.dataTransfer.setData('text/x-node-id', 'get.variable');
          e.dataTransfer.setData('application/x-node-params', JSON.stringify({ name: v.name, type: v.type }));
          e.dataTransfer.setData('text/plain', v.name);
        }
      }catch{}
    });
    chip.addEventListener('dragend', ()=> chip.classList.remove('dragging'));

    chip.addEventListener('click', async (e)=>{
      if (e.target === x || e.target === type) return;
      try{ await navigator.clipboard.writeText(opts.id ? String(opts.id) : String(v.name)); }catch{}
    });

    chip.addEventListener('dblclick', ()=>{
      if (opts.readonly){
        addVar({ name: uniqueName(cleanLabelToVarName(v.name)), type: v.type });
      } else {
        chip.classList.add('editing');
        const input = document.createElement('input');
        input.className = 'rename';
        input.value = v.name || '';
        const finish = (commit)=>{
          chip.classList.remove('editing');
          const nv = commit ? input.value.trim() : v.name;
          if (commit && nv && nv !== v.name){ v.name = uniqueName(nv); setVarsDirty(true); renderDock(); }
          input.replaceWith(name); name.textContent = v.name;
        };
        input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
        input.addEventListener('blur', ()=> finish(true));
        name.replaceWith(input); input.focus(); input.select();
      }
    });

    // open type picker for non-inherited
    if (!opts.readonly){
      type.title = 'Click to change type';
      type.addEventListener('click', (ev)=> openTypePickerFor(idx, ev.clientX, ev.clientY));
    }

    if (!opts.readonly){
      x.addEventListener('click', ()=> removeVar(idx));
    }

    chip.append(dot, name, type, x);
    chip.style.background = mix(typeColor(v.type), '#11131a', 0.85);
    chip.style.borderColor = mix(typeColor(v.type), '#1e2230', 0.65);
    return chip;
  }

  function uniqueName(base){
    const taken = new Set(VARS.map(z=>z.name));
    let name = String(base||'').replace(/[^a-zA-Z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
    if (!name) name = 'Var';
    if (!taken.has(name)) return name;
    let i = 2; while (taken.has(`${name}_${i}`)) i++;
    return `${name}_${i}`;
  }

  function persist(){ VARS = readVarsFromDOM(); setVarsDirty(true); renderDock(); }
  function readVarsFromDOM(){
    const out = [];
    for (const chip of els.list.querySelectorAll('.chip.var')){
      if (chip.classList.contains('inherited')) continue;
      const name = chip.querySelector('.name')?.textContent?.trim() || '';
      const type = chip.querySelector('.type')?.textContent || 'string';
      if (!name) continue;
      out.push({ name, type });
    }
    return out;
  }

  function addVar(v){ VARS.push(v); setVarsDirty(true); renderDock(); }
  function removeVar(idx){ VARS = VARS.filter((_,i)=> i !== idx); setVarsDirty(true); renderDock(); }

  els.addBtn.addEventListener('click', ()=>{ addVar({ name: uniqueName('NewVar'), type:'string' }); });
  els.bpSelect?.addEventListener('change', ()=> renderDock());

  /* -------------------- Guild fetch (inherited items) -------------------- */

  let FULL = { channels: [], roles: [], messages: [] };

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
  const MSG_URLS = gid ? [
    `${BOT_BASE}/runtime/guilds/${encodeURIComponent(gid)}/messages`,
    `${location.origin}/runtime/guilds/${encodeURIComponent(gid)}/messages`,
    `${location.origin}/api/runtime/guilds/${encodeURIComponent(gid)}/messages`,
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

  // ---------- Render (auto-generated categories by exact type) ----------
  function groupHeader(title, storageKey){
    const h = document.createElement('div');
    h.className = 'group-title';
    const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▾';
    const lbl = document.createElement('span'); lbl.textContent = title;
    h.append(chev, lbl);
    if (localStorage.getItem(storageKey) === '1'){ h.classList.add('collapsed'); }
    h.addEventListener('click', ()=>{
      const collapsed = h.classList.toggle('collapsed');
      const next = h.nextElementSibling;
      if (next) next.style.display = collapsed ? 'none' : '';
      localStorage.setItem(storageKey, collapsed ? '1' : '0');
    });
    return h;
  }

  function chipsRow(){
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    row.style.gap = '6px';
    return { row, append: (el)=> row.appendChild(el) };
  }

  function renderDock(){
    const q = (els.search?.value || '').trim().toLowerCase();

    const groups = new Map();

    // user variables
    VARS.forEach((v, idx)=>{
      if (q && !`${v.name} ${v.type}`.toLowerCase().includes(q)) return;
      const t = v.type || 'string';
      (groups.get(t) || groups.set(t, { user: [], inh: [] }).get(t)).user.push({ v, idx });
    });

    const chans = FULL.channels.map(c => ({
      name: (c.type===2?'🔊 ':'# ') + c.name,
      id: c.id,
      type: varTypeForChannel(c),
      nodeId: 'get.channel'
    }));
    const roles = FULL.roles.map(r => ({
      name: r.name,
      id: r.id,
      type: 'Role',
      nodeId: 'get.role'
    }));

    for (const item of [...chans, ...roles]){
      if (q && !`${item.name} ${item.type}`.toLowerCase().includes(q)) continue;
      (groups.get(item.type) || groups.set(item.type, { user: [], inh: [] }).get(item.type))
        .inh.push(item);
    }

    els.list.replaceChildren();
    const types = Array.from(groups.keys()).sort((a,b)=> a.localeCompare(b));
    for (const type of types){
      const data = groups.get(type); if (!data) continue;
      const header = groupHeader(type, `dock.group.${type}`);
      const { row, append } = chipsRow();

      for (const it of data.user) append(mkVarChip(it.v, it.idx, { readonly:false }));
      for (const it of data.inh) append(mkVarChip({ name: it.name, type }, -1, { readonly:true, nodeId: it.nodeId, id: it.id }));

      if (header.classList.contains('collapsed')) row.style.display='none';
      els.list.append(header, row);
    }
  }

  function mix(a, b, t){
    function hexToRgb(h){ const n=parseInt(h.slice(1),16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
    function toHex(n){ const s=n.toString(16).padStart(2,'0'); return s; }
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(A.r*(1-t)+B.r*t);
    const g = Math.round(A.g*(1-t)+B.g*t);
    const bl= Math.round(A.b*(1-t)+B.b*t);
    return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
  }

  if (els.search) els.search.addEventListener('input', renderDock);

  els.saveBtn?.addEventListener('click', async ()=>{
    if (!varsDirty) return;
    await saveVarsToServer();
  });
  els.revertBtn?.addEventListener('click', ()=>{
    if (!varsDirty) return;
    VARS = JSON.parse(JSON.stringify(SNAP));
    setVarsDirty(false);
    clearDirty(els.dirty);
    renderDock();
  });

  // External hook: allow editor actions to add variables
  window.addEventListener('variables:add', (e)=>{
    const { name, type } = e.detail || {};
    if (!name || !type) return;
    addVar({ name: uniqueName(String(name)), type: String(type) });
  });

  (async function loadGuild(){
    try{
      if (gid){
        const ch = await fetchFirstOk(CHANNEL_URLS);
        const rl = await fetchFirstOk(ROLE_URLS);
        const ms = await fetchFirstOk(MSG_URLS);
        FULL.channels = normalizeChannels(ch);
        FULL.roles = normalizeRoles(rl);
        FULL.messages = Array.isArray(ms) ? ms : [];
        console.log('%c[variables-dock] guild loaded','color:#22c55e', { channels: FULL.channels.length, roles: FULL.roles.length, messages: FULL.messages.length||0 });
      }
    }catch(err){
      console.error('[variables-dock] guild load failed', err);
    }finally{
      renderDock();
    }
  })();

  (async function initVars(){ await loadVarsFromServer(); })();

})();
