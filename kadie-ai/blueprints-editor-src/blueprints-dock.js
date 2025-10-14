/* eslint-disable no-console */
(function init(){
  const dock = document.getElementById('bpdock');
  const list = document.getElementById('bpList');
  const sel  = document.getElementById('bpSelect');     // hidden, kept for compatibility
  const btnCreate = document.getElementById('bpCreate'); // legacy hidden buttons
  const btnRename = document.getElementById('bpRename');
  const btnDelete = document.getElementById('bpDelete');
  const editor = document.getElementById('editor');
  if (!dock || !list || !sel || !btnCreate || !btnRename || !btnDelete || !editor){
    console.warn('[blueprints-dock] missing required DOM');
    return;
  }

  // ---------- constants ----------
  const NAME_MAX = 30;
  const MAX_BLUEPRINTS = 20;
  const KEY_W = 'kadie.bpDock.width';
  const MIN_W = 220, MAX_W = 520;
  const KEY_LAYOUT = 'kadie.bpDock.layout.v2';

  // ---------- style overrides ----------
  (function injectStyles(){
    if (document.getElementById('bp-dock-override-styles')) return;
    const s = document.createElement('style');
    s.id = 'bp-dock-override-styles';
    s.textContent = `
      #bpdock .bp-list{
        display:flex; flex-direction:column;
        align-items:center; gap:8px;
      }
      /* chips have uniform width; height grows with wrapping */
      #bpdock .chip{
        position:relative;
        width:90%;
        min-height:42px;
        padding:6px 10px;
        border-radius:10px;
        background:#1f2330; color:#e5e7eb;
        cursor:pointer; user-select:none;
        text-align:center;
        display:flex; align-items:center; justify-content:center;
        overflow:visible;
      }
      #bpdock .chip.active{ background:#2a3144; }
      #bpdock .chip .name{
        display:block;
        max-width:calc(100% - 14px); /* reserve for red sidebar */
        white-space:normal;
        overflow-wrap:anywhere;
        word-break:break-word;
        line-height:1.15;
      }
      #bpdock .chip .name[contenteditable="true"]{
        outline:none; cursor:text; min-width:60px;
      }
      #bpdock .chip .name[contenteditable="true"]:empty::before{ content:""; }
      #bpdock .chip.editing{ outline:1px dashed #2b2f3a; }
      #bpdock .chip.add{ background:#283042; }
      #bpdock .chip.add.disabled{ opacity:.5; cursor:not-allowed; }

      /* red delete/cancel sidebar overlay (no size change) */
      #bpdock .chip .bar{
        position:absolute; top:0; right:0;
        width:12px; height:100%;
        background:#dc2626;
        opacity:0; transform:translateX(8px);
        transition:opacity .12s ease, transform .12s ease;
        border-top-right-radius:10px; border-bottom-right-radius:10px;
      }
      #bpdock .chip:hover .bar, #bpdock .chip:focus-within .bar{ opacity:1; transform:translateX(0); }
      #bpdock .chip .bar-btn{
        position:absolute; inset:0; left:auto; right:0; width:12px; height:100%;
        background:transparent; border:none; padding:0; margin:0; cursor:pointer;
      }

      /* groups */
      #bpdock .group{
        width:90%;
        background:#191d28;
        border-radius:10px;
        overflow:hidden;
      }
      #bpdock .group-header{
        display:flex; align-items:center; gap:8px;
        padding:6px 8px;
        cursor:grab; user-select:none;
        color:#e5e7eb; background:#222735;
      }
      #bpdock .group-header:active{ cursor:grabbing; }
      #bpdock .group .caret{
        border:none; background:transparent; color:#9aa4b2; cursor:pointer; padding:0 4px;
        font-size:14px; line-height:1;
      }
      #bpdock .group .gname{
        flex:1; text-align:left; font-weight:600;
        white-space:normal; overflow-wrap:anywhere; word-break:break-word;
      }
      #bpdock .group .gname[contenteditable="true"]{ outline:none; cursor:text; }
      #bpdock .group-body{ padding:8px; display:flex; flex-direction:column; align-items:center; gap:8px; }
      #bpdock .group.collapsed .group-body{ display:none; }

      /* drag hints */
      #bpdock .drop-before{ box-shadow: inset 0 3px 0 #60a5fa; }
      #bpdock .drop-after{  box-shadow: inset 0 -3px 0 #60a5fa; }
      #bpdock .drop-onto{   outline:2px dashed #60a5fa; outline-offset:-4px; }
      #bpdock .drop-into{   outline:2px dashed #60a5fa; }

      /* toast */
      #bpdock .bp-toast{
        width:90%; background:#2b3142; color:#e5e7eb;
        border-left:4px solid #ef4444; padding:8px 10px; border-radius:8px;
        font-size:12px; text-align:center;
      }

      #bpdock.resizing{ cursor:ew-resize; }
    `;
    document.head.appendChild(s);
  })();

  // --------- resizable left dock ----------
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
  const savedW = Number(localStorage.getItem(KEY_W) || 0);
  if (savedW) dock.style.width = `${clamp(savedW, MIN_W, MAX_W)}px`;

  (function wireResize(){
    const handle = dock.querySelector('.resizer');
    if (!handle) return;
    let active = false;
    const onMove = (e)=>{
      if (!active) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      const left = dock.getBoundingClientRect().left;
      const w = clamp(x - left, MIN_W, MAX_W);
      dock.style.width = `${w}px`;
    };
    const onUp = ()=>{
      if (!active) return;
      active = false; dock.classList.remove('resizing');
      localStorage.setItem(KEY_W, String(parseFloat(dock.style.width) || 0));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
    const onDown = (e)=>{
      active = true; dock.classList.add('resizing');
      window.addEventListener('mousemove', onMove, { passive:false });
      window.addEventListener('touchmove', onMove, { passive:false });
      window.addEventListener('mouseup', onUp, { passive:true });
      window.addEventListener('touchend', onUp, { passive:true });
      e.preventDefault();
    };
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive:false });
  })();

  // keep dock height consistent with editor
  function ensureHeight(){
    const h = editor?.getBoundingClientRect().height || Math.round(window.innerHeight * 0.68);
    dock.style.maxHeight = `${h}px`;
    dock.style.height = `${h}px`;
    dock.style.overflow = 'auto';
  }
  ensureHeight();
  window.addEventListener('resize', ensureHeight);

  // --------- helpers ----------
  function trigger(el, type){ el.dispatchEvent(new Event(type, { bubbles:true })); }
  function selectByValue(v){
    if (!v) return;
    let matched = false;
    for (const o of sel.options){
      const isMatch = String(o.value) === String(v);
      o.selected = isMatch;
      if (isMatch) matched = true;
    }
    if (!matched) return;
    sel.value = String(v);
    trigger(sel, 'input'); trigger(sel, 'change');
    window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:String(v) } }));
    setTimeout(()=> trigger(sel, 'change'), 0);
  }
  function overridePromptOnce(answer, fn){
    const orig = window.prompt; window.prompt = () => String(answer ?? '');
    try { fn(); } finally { window.prompt = orig; }
  }
  function overrideConfirmOnce(fn){
    const orig = window.confirm; window.confirm = () => true;
    try { fn(); } finally { window.confirm = orig; }
  }
  const sanitizeOneLine = (s)=> String(s||'').replace(/\s+/g,' ').trim();

  function safeGetSelection(doc){
    try { return (doc && doc.getSelection) ? doc.getSelection() : window.getSelection(); }
    catch { return window.getSelection(); }
  }
  function caretToEnd(el){
    if (!el || !el.isConnected) return;
    const doc = el.ownerDocument || document;
    const sel = safeGetSelection(doc);
    if (!sel) return;
    try{
      const range = doc.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }catch(e){
      // ignore "range isn't in document" and similar
    }
  }
  function enforceMaxChars(el){
    if (!el) return;
    const text = el.textContent || '';
    let norm = text.replace(/\s+/g,' ');
    if (norm.length > NAME_MAX) norm = norm.slice(0, NAME_MAX);
    if (norm !== text){
      el.textContent = norm;
      if (el.isConnected) caretToEnd(el);
    }
  }
  function focusWhenConnected(el, tries=8){
    if (!el) return;
    if (el.isConnected){
      try{ el.focus(); }catch{}
      caretToEnd(el);
    } else if (tries>0){
      requestAnimationFrame(()=> focusWhenConnected(el, tries-1));
    }
  }
  const newGroupId = ()=> 'grp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);

  // toast
  function toast(msg){
    const t = document.createElement('div');
    t.className = 'bp-toast';
    t.textContent = msg;
    list.prepend(t);
    setTimeout(()=> t.remove(), 1800);
  }

  // count existing blueprints from the hidden <select> (Firebase-synced)
  function bpCount(){
    return Array.from(sel.querySelectorAll('option')).filter(o => String(o.value).trim().length > 0).length;
  }

  // hard block any attempt to trigger legacy create when at limit
  btnCreate.addEventListener('click', (e)=>{
    if (bpCount() >= MAX_BLUEPRINTS){
      e.stopImmediatePropagation();
      e.preventDefault();
      toast(`Limit reached: ${MAX_BLUEPRINTS} blueprints. Delete one to add more.`);
    }
  }, true);

  // --------- layout persistence ----------
  function loadLayout(){
    try { return JSON.parse(localStorage.getItem(KEY_LAYOUT) || '[]'); }
    catch { return []; }
  }
  function saveLayout(model){ localStorage.setItem(KEY_LAYOUT, JSON.stringify(model)); }

  function currentOptions(){
    return Array.from(sel.querySelectorAll('option')).map(o=>({
      id: String(o.value), name: String(o.textContent || '')
    })).filter(o=> o.id);
  }

  function flattenIds(model){
    const out = [];
    for (const n of model){
      if (n.type === 'item') out.push(n.id);
      else if (n.type === 'group') for (const it of n.items) if (it.type==='item') out.push(it.id);
    }
    return out;
  }

  function normalizeLayout(model){
    const opts = currentOptions();
    const ids = new Set(opts.map(o=> o.id));
    function filterNode(node){
      if (node.type==='item') return ids.has(node.id);
      if (node.type==='group'){
        node.items = node.items.filter(it=> ids.has(it.id));
        return node.items.length>0;
      }
      return false;
    }
    model = model.filter(filterNode);
    const present = new Set(flattenIds(model));
    for (const o of opts){
      if (!present.has(o.id)) model.push({ type:'item', id:o.id });
    }
    return model;
  }

  // layout ops
  function removeItem(model, id){
    let removed=null;
    for (let i=0;i<model.length;i++){
      const n = model[i];
      if (n.type==='item' && n.id===id){ removed = n; model.splice(i,1); return removed; }
      if (n.type==='group'){
        const idx = n.items.findIndex(it=> it.id===id);
        if (idx>=0){ removed = n.items[idx]; n.items.splice(idx,1); if (n.items.length===0) model.splice(i,1); return removed; }
      }
    }
    return removed;
  }
  function insertItemAtTop(model, node, index){
    model.splice(Math.max(0, Math.min(index, model.length)), 0, node);
  }
  function insertItemIntoGroup(model, groupId, node, index){
    const g = model.find(n=> n.type==='group' && n.id===groupId);
    if (!g) return false;
    const idx = Math.max(0, Math.min(index, g.items.length));
    g.items.splice(idx, 0, node);
    return true;
  }
  function findItemParent(model, id){
    for (let i=0;i<model.length;i++){
      const n=model[i];
      if (n.type==='item' && n.id===id) return { where:'top', index:i };
      if (n.type==='group'){
        const j = n.items.findIndex(it=> it.id===id);
        if (j>=0) return { where:'group', group:n, groupIndex:i, index:j };
      }
    }
    return null;
  }
  function createGroupAroundTarget(model, targetId, groupName){
    const pos = findItemParent(model, targetId);
    if (!pos || pos.where!=='top') return null;
    const grp = { type:'group', id:newGroupId(), name: groupName || 'Category', collapsed:false, items:[ {type:'item', id:targetId} ] };
    model.splice(pos.index, 1, grp);
    return grp;
  }

  // --------- inline editors ----------
  function buildInlineEditorChip(initial, onCommit, onCancel){
    const el = document.createElement('div');
    el.className = 'chip editing';

    const name = document.createElement('span');
    name.className = 'name';
    name.contentEditable = 'true';
    name.spellcheck = false;
    if (initial) name.textContent = initial.slice(0, NAME_MAX);

    name.addEventListener('input', ()=> enforceMaxChars(name));
    name.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
    });
    name.addEventListener('paste', (ev)=>{
      ev.preventDefault();
      const text = (ev.clipboardData || window.clipboardData).getData('text') || '';
      document.execCommand('insertText', false, text.replace(/\s+/g,' '));
      enforceMaxChars(name);
    });

    const bar = document.createElement('div'); bar.className = 'bar';
    const barBtn = document.createElement('button'); barBtn.className = 'bar-btn'; barBtn.setAttribute('aria-label','Cancel');
    barBtn.addEventListener('click', (e)=>{ e.stopPropagation(); finish(false); });
    bar.appendChild(barBtn);

    el.append(name, bar);

    function finish(commit){
      let val = sanitizeOneLine(name.textContent);
      if (val.length > NAME_MAX) val = val.slice(0, NAME_MAX);
      if (commit && val){ onCommit(val, el); } else { onCancel && onCancel(el); }
    }
    name.addEventListener('blur', ()=> finish(true));

    // focus once the chip is attached
    focusWhenConnected(name);

    return el;
  }

  // --------- drag+drop helpers ----------
  function setDragData(e, payload){
    try{ e.dataTransfer.setData('application/x-bp', JSON.stringify(payload)); }
    catch{ e.dataTransfer.setData('text/plain', JSON.stringify(payload)); }
  }
  function getDragData(e){
    let t = e.dataTransfer.getData('application/x-bp') || e.dataTransfer.getData('text/plain') || '';
    try{ return JSON.parse(t); }catch{ return null; }
  }
  function edgeZone(targetEl, clientY){
    const r = targetEl.getBoundingClientRect();
    const y = clientY - r.top;
    const third = r.height / 3;
    if (y < third) return 'before';
    if (y > r.height - third) return 'after';
    return 'onto';
  }
  function clearDropHints(){
    list.querySelectorAll('.drop-before,.drop-after,.drop-onto,.drop-into').forEach(n=> n.classList.remove('drop-before','drop-after','drop-onto','drop-into'));
  }

  // --------- UI builders ----------
  function mkChip(opt, model){
    const el = document.createElement('div');
    el.className = 'chip';
    const selected = sel.value && String(opt.id) === String(sel.value);
    if (selected) el.classList.add('active');

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = String(opt.name || '').slice(0, NAME_MAX);

    const bar = document.createElement('div'); bar.className = 'bar';
    const barBtn = document.createElement('button'); barBtn.className = 'bar-btn'; barBtn.setAttribute('aria-label','Delete');
    barBtn.addEventListener('click', (e)=>{
      e.stopPropagation(); selectByValue(opt.id); overrideConfirmOnce(()=> btnDelete.click());
    });
    bar.appendChild(barBtn);

    el.append(name, bar);

    // select
    el.addEventListener('click', (e)=>{ if (e.target === barBtn) return; selectByValue(opt.id); rebuild(); });

    // rename via dblclick
    el.addEventListener('dblclick', ()=>{
      const editorChip = buildInlineEditorChip(opt.name, (nextName)=>{
        selectByValue(opt.id);
        overridePromptOnce(nextName, ()=> btnRename.click());
      }, ()=> rebuild());
      el.replaceWith(editorChip);
    });

    // drag: item
    el.draggable = true;
    el.addEventListener('dragstart', (e)=>{
      el.classList.add('dragging');
      setDragData(e, { kind:'item', id: opt.id });
    });
    el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); clearDropHints(); });

    // drop targets on chips
    el.addEventListener('dragover', (e)=>{
      const data = getDragData(e); if (!data) return;
      if (data.kind!=='item' && data.kind!=='group') return;
      e.preventDefault();
      clearDropHints();
      const zone = edgeZone(el, e.clientY);
      if (data.kind==='item'){
        if (zone==='before') el.classList.add('drop-before');
        else if (zone==='after') el.classList.add('drop-after');
        else el.classList.add('drop-onto');
      } else if (data.kind==='group'){
        if (zone==='before') el.classList.add('drop-before');
        else if (zone==='after') el.classList.add('drop-after');
      }
    });
    el.addEventListener('dragleave', clearDropHints);

    el.addEventListener('drop', (e)=>{
      const data = getDragData(e); if (!data) return;
      e.preventDefault();
      clearDropHints();

      let modelNow = loadLayout(); modelNow = normalizeLayout(modelNow);
      if (data.kind==='item' && data.id === opt.id) return;

      const zone = edgeZone(el, e.clientY);

      if (zone==='onto' && data.kind==='item'){
        const parent = findItemParent(modelNow, opt.id);
        if (parent && parent.where==='group'){
          const moving = removeItem(modelNow, data.id);
          if (!moving) return;
          insertItemIntoGroup(modelNow, parent.group.id, moving, parent.group.items.length);
        } else {
          const opts = currentOptions();
          const targetOpt = opts.find(o=> o.id===opt.id);
          const grp = createGroupAroundTarget(modelNow, opt.id, (targetOpt && targetOpt.name) || 'Category');
          if (!grp) return;
          const moving = removeItem(modelNow, data.id);
          if (!moving) return;
          grp.items.push(moving);
        }
        saveLayout(modelNow); rebuild();
        return;
      }

      const moving = (data.kind==='item')
        ? removeItem(modelNow, data.id)
        : (function(){
            const idx = modelNow.findIndex(n=> n.type==='group' && n.id===data.id);
            if (idx<0) return null;
            const g = modelNow[idx]; modelNow.splice(idx,1); return g;
          })();
      if (!moving) return;

      const parent = findItemParent(modelNow, opt.id);
      if (parent && parent.where==='group'){
        const insertAt = zone==='before' ? parent.index : parent.index+1;
        if (moving.type==='item'){
          insertItemIntoGroup(modelNow, parent.group.id, moving, insertAt);
        } else {
          const topIndex = parent.groupIndex + (zone==='after' ? 1 : 0);
          insertItemAtTop(modelNow, moving, topIndex);
        }
      } else {
        const topIndex = modelNow.findIndex(n=> (n.type==='item' && n.id===opt.id) || (n.type==='group' && n.id===opt.id));
        const insertIndex = topIndex + (zone==='after' ? 1 : 0);
        insertItemAtTop(modelNow, moving, insertIndex);
      }
      saveLayout(modelNow); rebuild();
    });

    return el;
  }

  function mkGroup(node, model){
    const wrap = document.createElement('div');
    wrap.className = 'group';
    wrap.dataset.grp = node.id;
    if (node.collapsed) wrap.classList.add('collapsed');

    const header = document.createElement('div');
    header.className = 'group-header';
    header.draggable = true;

    const caret = document.createElement('button');
    caret.className = 'caret';
    caret.textContent = node.collapsed ? '▸' : '▾';
    caret.addEventListener('click', (e)=>{
      e.stopPropagation();
      const m = loadLayout(); const g = m.find(n=> n.type==='group' && n.id===node.id);
      if (!g) return; g.collapsed = !g.collapsed; saveLayout(m); rebuild();
    });

    const gname = document.createElement('span');
    gname.className = 'gname';
    gname.textContent = node.name || 'Category';

    // rename group by dblclick
    gname.addEventListener('dblclick', ()=>{
      gname.contentEditable = 'true'; focusWhenConnected(gname);
    });
    gname.addEventListener('blur', ()=>{
      gname.contentEditable = 'false';
      const m = loadLayout(); const g = m.find(n=> n.type==='group' && n.id===node.id); if (!g) return;
      g.name = sanitizeOneLine(gname.textContent).slice(0, NAME_MAX) || 'Category'; saveLayout(m);
    });
    gname.addEventListener('input', ()=> enforceMaxChars(gname));
    gname.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter'){ ev.preventDefault(); gname.blur(); } });

    header.append(caret, gname);

    const body = document.createElement('div');
    body.className = 'group-body';

    // drag: group header
    header.addEventListener('dragstart', (e)=>{ setDragData(e, { kind:'group', id: node.id }); });
    header.addEventListener('dragend', ()=> clearDropHints());

    // drop on header: reorder groups or drop item into group
    header.addEventListener('dragover', (e)=>{
      const data = getDragData(e); if (!data) return;
      e.preventDefault(); clearDropHints();
      const zone = edgeZone(header, e.clientY);
      if (data.kind==='group'){
        if (zone==='before') header.classList.add('drop-before');
        else if (zone==='after') header.classList.add('drop-after');
      } else if (data.kind==='item'){
        if (zone==='onto') header.classList.add('drop-into');
        else if (zone==='before') header.classList.add('drop-before');
        else header.classList.add('drop-after');
      }
    });
    header.addEventListener('dragleave', clearDropHints);

    header.addEventListener('drop', (e)=>{
      const data = getDragData(e); if (!data) return; e.preventDefault(); clearDropHints();
      let m = loadLayout(); m = normalizeLayout(m);
      const zone = edgeZone(header, e.clientY);

      if (data.kind==='group'){
        if (data.id === node.id) return;
        const idxFrom = m.findIndex(n=> n.type==='group' && n.id===data.id);
        const idxTo = m.findIndex(n=> n.type==='group' && n.id===node.id);
        if (idxFrom<0 || idxTo<0) return;
        const moving = m.splice(idxFrom,1)[0];
        const insertIndex = idxTo + (zone==='after' ? 1 : 0);
        m.splice(insertIndex, 0, moving);
        saveLayout(m); rebuild(); return;
      }

      if (data.kind==='item'){
        const moving = removeItem(m, data.id); if (!moving) return;
        const g = m.find(n=> n.type==='group' && n.id===node.id); if (!g) return;
        if (zone==='before' || zone==='after'){
          const groupIndex = m.findIndex(n=> n.type==='group' && n.id===node.id);
          insertItemAtTop(m, moving, groupIndex + (zone==='after' ? 1 : 0));
        } else {
          g.items.push(moving);
        }
        saveLayout(m); rebuild(); return;
      }
    });

    // drop on body -> append to this group
    body.addEventListener('dragover', (e)=>{
      const data = getDragData(e); if (!data) return;
      if (data.kind!=='item') return;
      e.preventDefault(); clearDropHints(); body.classList.add('drop-into');
    });
    body.addEventListener('dragleave', clearDropHints);
    body.addEventListener('drop', (e)=>{
      const data = getDragData(e); if (!data) return; e.preventDefault(); clearDropHints();
      let m = loadLayout(); m = normalizeLayout(m);
      const moving = removeItem(m, data.id); if (!moving) return;
      insertItemIntoGroup(m, node.id, moving, m.find(n=> n.type==='group' && n.id===node.id)?.items.length ?? 0);
      saveLayout(m); rebuild();
    });

    // children
    const opts = currentOptions();
    for (const it of node.items){
      const opt = opts.find(o=> o.id===it.id);
      if (opt) body.appendChild(mkChip(opt, model));
    }

    wrap.append(header, body);
    return wrap;
  }

  function mkAddChip(){
    const add = document.createElement('div');
    add.className = 'chip add';
    add.textContent = '+';

    const setDisabledState = ()=>{
      if (bpCount() >= MAX_BLUEPRINTS){
        add.classList.add('disabled');
      } else {
        add.classList.remove('disabled');
      }
    };
    setDisabledState();

    add.addEventListener('click', ()=>{
      if (bpCount() >= MAX_BLUEPRINTS){
        toast(`Limit reached: ${MAX_BLUEPRINTS} blueprints. Delete one to add more.`);
        return;
      }
      const editorChip = buildInlineEditorChip('', (newName)=>{
        if (bpCount() >= MAX_BLUEPRINTS){
          toast(`Limit reached: ${MAX_BLUEPRINTS} blueprints. Delete one to add more.`);
          rebuild();
          return;
        }
        overridePromptOnce(newName, ()=> btnCreate.click());
      }, (chipEl)=>{ chipEl.replaceWith(mkAddChip()); });
      add.replaceWith(editorChip);
    });
    return add;
  }

  function rebuild(){
    let model = loadLayout();
    model = normalizeLayout(model);

    const opts = currentOptions();
    list.replaceChildren();

    for (const node of model){
      if (node.type==='item'){
        const opt = opts.find(o=> o.id===node.id);
        if (opt) list.appendChild(mkChip(opt, model));
      } else if (node.type==='group'){
        list.appendChild(mkGroup(node, model));
      }
    }
    list.appendChild(mkAddChip());
  }

  // observe the hidden select for add/rename/delete changes
  const mo = new MutationObserver(()=>{
    let m = loadLayout(); m = normalizeLayout(m); saveLayout(m); rebuild();
  });
  mo.observe(sel, { childList:true, subtree:false, attributes:true, attributeFilter:['value'] });
  sel.addEventListener('change', rebuild);

  // initial build
  rebuild();
})();
