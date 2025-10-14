// /kadie-ai/blueprints-editor-src/blueprints-dock.js
/* eslint-disable no-console */
(function init(){
  const dock = document.getElementById('bpdock');
  const list = document.getElementById('bpList');
  const sel  = document.getElementById('bpSelect');     // hidden, kept for compatibility
  const btnCreate = document.getElementById('bpCreate'); // hidden legacy buttons
  const btnRename = document.getElementById('bpRename');
  const btnDelete = document.getElementById('bpDelete');
  const editor = document.getElementById('editor');
  if (!dock || !list || !sel || !btnCreate || !btnRename || !btnDelete || !editor){
    console.warn('[blueprints-dock] missing required DOM');
    return;
  }

  // --------- resizable left dock ----------
  const KEY_W = 'kadie.bpDock.width';
  const MIN_W = 220, MAX_W = 520;
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
  function trigger(el, type){
    const ev = new Event(type, { bubbles:true });
    el.dispatchEvent(ev);
  }
  function selectByValue(v){
    if (!v) return;

    // ensure the matching <option> is actually selected
    let matched = false;
    for (const o of sel.options){
      const isMatch = String(o.value) === String(v);
      o.selected = isMatch;
      if (isMatch) matched = true;
    }
    if (!matched) return;

    // set value and fire both events to match legacy listeners
    sel.value = String(v);
    trigger(sel, 'input');
    trigger(sel, 'change');

    // also broadcast for any new listeners
    window.dispatchEvent(new CustomEvent('bp:selected', { detail:{ id:String(v) } }));

    // defer a second change in case handlers attach late
    setTimeout(()=> trigger(sel, 'change'), 0);
  }
  function overridePromptOnce(answer, fn){
    const orig = window.prompt;
    window.prompt = () => String(answer ?? '');
    try { fn(); } finally { window.prompt = orig; }
  }
  function overrideConfirmOnce(fn){
    const orig = window.confirm;
    window.confirm = () => true;
    try { fn(); } finally { window.confirm = orig; }
  }

  // --------- UI builders ----------
  function mkChip(opt){
    const el = document.createElement('div');
    el.className = 'chip';
    el.title = opt.textContent;
    if (opt.selected) el.classList.add('active');

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = opt.textContent;

    const del = document.createElement('button');
    del.className = 'x'; del.textContent = '×'; del.title = 'Delete';

    el.append(name, del);

    // select
    el.addEventListener('click', (e)=>{
      if (e.target === del) return;
      selectByValue(opt.value);
      rebuild(); // refresh active state
    });

    // inline rename on double click
    el.addEventListener('dblclick', ()=>{
      const input = document.createElement('input');
      input.className = 'rename';
      input.value = opt.textContent;
      const finish = (commit)=>{
        const nextName = commit ? (input.value || '').trim() : opt.textContent;
        input.replaceWith(name);
        if (!commit || !nextName || nextName === opt.textContent) return;
        // select and rename via legacy button
        selectByValue(opt.value);
        overridePromptOnce(nextName, ()=> btnRename.click());
      };
      input.addEventListener('keydown', (ev)=>{ if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); });
      input.addEventListener('blur', ()=> finish(true));
      name.replaceWith(input);
      input.focus(); input.select();
    });

    // delete
    del.addEventListener('click', (e)=>{
      e.stopPropagation();
      selectByValue(opt.value);
      overrideConfirmOnce(()=> btnDelete.click());
    });

    // optional drag metadata
    el.draggable = true;
    el.addEventListener('dragstart', (e)=>{
      el.classList.add('dragging');
      try{
        e.dataTransfer.setData('text/x-blueprint-id', String(opt.value));
        e.dataTransfer.setData('text/plain', String(opt.textContent));
      }catch{}
    });
    el.addEventListener('dragend', ()=> el.classList.remove('dragging'));

    return el;
  }

  function mkAddChip(){
    const add = document.createElement('div');
    add.className = 'chip add';
    add.textContent = '+';           // no "Create" label
    add.title = 'Create new blueprint';
    add.addEventListener('click', ()=>{
      // inline naming flow
      const input = document.createElement('input');
      input.className = 'rename';
      input.placeholder = 'New Blueprint';
      add.replaceWith(input);
      const finish = (commit)=>{
        const name = commit ? (input.value || 'New Blueprint').trim() : '';
        const addAgain = mkAddChip();
        input.replaceWith(addAgain);
        if (!name) return;
        overridePromptOnce(name, ()=> btnCreate.click());
      };
      input.addEventListener('keydown', (ev)=>{ if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); });
      input.addEventListener('blur', ()=> finish(true));
      input.focus();
    });
    return add;
  }

  function rebuild(){
    const opts = Array.from(sel.querySelectorAll('option'));
    list.replaceChildren(...opts.map(mkChip), mkAddChip());
  }

  // observe hidden select to keep dock in sync with legacy code
  const mo = new MutationObserver(()=> rebuild());
  mo.observe(sel, { childList:true, subtree:false, attributes:true, attributeFilter:['value'] });
  sel.addEventListener('change', rebuild);

  // initial
  rebuild();
})();
