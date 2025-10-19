/* eslint-disable no-console */
(function init () {
  const dock = document.getElementById("bpdock");
  const list = document.getElementById("bpList");
  const sel  = document.getElementById("bpSelect");
  const btnCreate = document.getElementById("bpCreate");
  const btnRename = document.getElementById("bpRename");
  const btnDelete = document.getElementById("bpDelete");
  const editor = document.getElementById("editor");
  if (!dock || !list || !sel || !btnCreate || !btnRename || !btnDelete || !editor) {
    console.warn("[blueprints-dock] missing required DOM");
    return;
  }

  const NAME_MAX = 30;
  const MAX_BLUEPRINTS = 20;
  const KEY_W = "kadie.bpDock.width";
  const MIN_W = 220, MAX_W = 520;

  /* ---------------- styles ---------------- */
  if (!document.getElementById("bp-dock-override-styles")) {
    const s = document.createElement("style");
    s.id = "bp-dock-override-styles";
    s.textContent = `
      #bpdock .bp-list{ display:flex; flex-direction:column; align-items:center; gap:8px; }
      #bpdock .chip{
        position:relative; width:90%; min-height:42px; padding:6px 10px; border-radius:10px;
        background:#1f2330; color:#e5e7eb; user-select:none; text-align:center;
        display:flex; align-items:center; justify-content:center; overflow:visible;
      }
      #bpdock .chip.active{ background:#2a3144; }
      #bpdock .chip .name{
        display:block; max-width:calc(100% - 14px); white-space:normal; overflow-wrap:anywhere; word-break:break-word; line-height:1.15;
        background:transparent; border:none;
      }
      #bpdock .chip .name[contenteditable="true"]{ outline:none; background:transparent; border:none; box-shadow:none; cursor:text; }
      #bpdock .chip.editing{ outline:none; }
      #bpdock .chip.add{ background:#283042; cursor:pointer; }
      #bpdock .chip.add.disabled{ opacity:.5; cursor:not-allowed; }
      /* red delete bar */
      #bpdock .chip .bar{ position:absolute; top:0; right:0; width:12px; height:100%; background:#dc2626;
        opacity:0; transform:translateX(8px); transition:opacity .12s ease, transform .12s ease;
        border-top-right-radius:10px; border-bottom-right-radius:10px; }
      #bpdock .chip:hover .bar, #bpdock .chip:focus-within .bar{ opacity:1; transform:translateX(0); }
      #bpdock .chip .bar-btn{ position:absolute; inset:0; left:auto; right:0; width:12px; height:100%;
        background:transparent; border:none; padding:0; margin:0; cursor:pointer; }
      #bpdock .bp-toast{ width:90%; background:#2b3142; color:#e5e7eb; border-left:4px solid #ef4444; padding:8px 10px; border-radius:8px; font-size:12px; text-align:center; }
      #bpdock.resizing{ cursor:ew-resize; }
      /* while editing a name, block interaction on every chip except the inline editor */
      #bpdock.lock .chip:not(.editing){ pointer-events:none; opacity:.95; }
    `;
    document.head.appendChild(s);
  }

  /* -------------- sizing -------------- */
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
  const savedW = Number(localStorage.getItem(KEY_W) || 0);
  if (savedW) dock.style.width = `${clamp(savedW, MIN_W, MAX_W)}px`;
  (function wireResize(){
    const handle = dock.querySelector(".resizer");
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
      active = false; dock.classList.remove("resizing");
      localStorage.setItem(KEY_W, String(parseFloat(dock.style.width) || 0));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
    const onDown = (e)=>{
      active = true; dock.classList.add("resizing");
      window.addEventListener("mousemove", onMove, { passive:false });
      window.addEventListener("touchmove", onMove, { passive:false });
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchend", onUp);
      e.preventDefault();
    };
    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive:false });
  })();

  function ensureHeight(){
    const h = editor?.getBoundingClientRect().height || Math.round(window.innerHeight * 0.68);
    dock.style.maxHeight = `${h}px`;
    dock.style.height = `${h}px`;
    dock.style.overflow = "auto";
  }
  ensureHeight();
  window.addEventListener("resize", ensureHeight);

  /* -------------- helpers -------------- */
  function resolveId(v){
    const opts = Array.from(sel.options);
    let o = opts.find(x => String(x.value) === String(v));
    if (o) return String(o.value);
    o = opts.find(x => String(x.textContent || "").trim() === String(v));
    return o ? String(o.value) : String(v);
  }

  function setActiveChip(id){
    list.querySelectorAll(".chip").forEach(ch=>{
      if (ch.classList.contains("add")) return;
      ch.classList.toggle("active", String(ch.dataset.id) === String(id));
    });
  }

  function selectByValue(v, source="dock"){
    const resolved = resolveId(v);
    if (!resolved) return;
    setActiveChip(resolved);
    const changed = sel.value !== resolved;
    sel.value = resolved;

    // DEBUG: emit a single, obvious trace at the exact selection handoff
    console.info('[BP DEBUG] dock->select', { resolved, source, changed });

    if (changed){
      window.dispatchEvent(new CustomEvent("bp:selected", { detail:{ id: resolved, source } }));
    }
  }

  function overridePromptOnce(answer, fn){
    const orig = window.prompt; window.prompt = () => String(answer ?? "");
    try { fn(); } finally { window.prompt = orig; }
  }
  const sanitizeOneLine = (s)=> String(s||"").replace(/\s{2,}/g," ").trim();

  function toast(msg){
    const t = document.createElement("div");
    t.className = "bp-toast";
    t.textContent = msg;
    list.prepend(t);
    setTimeout(()=> t.remove(), 1800);
  }

  function bpCount(){
    return Array.from(sel.querySelectorAll("option")).filter(o => String(o.value).trim().length > 0).length;
  }

  btnCreate.addEventListener("click", (e)=>{
    if (bpCount() >= MAX_BLUEPRINTS){
      e.stopImmediatePropagation(); e.preventDefault();
      toast(`Limit reached: ${MAX_BLUEPRINTS} blueprints. Delete one to add more.`);
    }
  }, true);

  /* -------------- UI -------------- */
  function buildInlineEditorChip(initial, onCommit, onCancel){
    const el = document.createElement("div");
    el.className = "chip editing";
    dock.classList.add("lock");

    const name = document.createElement("span");
    name.className = "name";
    name.contentEditable = "true";
    name.spellcheck = false;
    if (initial) name.textContent = initial.slice(0, NAME_MAX);

    name.addEventListener("keydown", (ev)=>{
      if (ev.key === "Enter"){ ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape"){ ev.preventDefault(); finish(false); }
    });
    name.addEventListener("input", ()=>{
      const text = (name.textContent || "");
      if (text.length > NAME_MAX) name.textContent = text.slice(0, NAME_MAX);
    });

    const bar = document.createElement("div"); bar.className = "bar";
    el.append(name, bar);

    function finish(commit){
      let val = sanitizeOneLine(name.textContent);
      if (val.length > NAME_MAX) val = val.slice(0, NAME_MAX);
      dock.classList.remove("lock");
      if (commit && val){ onCommit(val, el); } else { onCancel && onCancel(el); }
    }
    name.addEventListener("blur", ()=> finish(true));
    requestAnimationFrame(()=> name.focus());
    return el;
  }

  function mkChip(opt){
    const el = document.createElement("div");
    el.className = "chip";
    el.dataset.id = String(opt.id);
    if (sel.value && String(opt.id) === String(sel.value)) el.classList.add("active");

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = String(opt.name || "").slice(0, NAME_MAX);

    const bar = document.createElement("div"); bar.className = "bar";
    const barBtn = document.createElement("button"); barBtn.className = "bar-btn"; barBtn.setAttribute("aria-label","Delete");

    const performDelete = (e)=>{
      if (dock.classList.contains("lock")) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent("bp:delete-request", { detail:{ id: opt.id } }));
    };
    bar.addEventListener("mousedown", performDelete);
    bar.addEventListener("click", performDelete);
    barBtn.addEventListener("mousedown", performDelete);
    barBtn.addEventListener("click", performDelete);

    bar.appendChild(barBtn);
    el.append(name, bar);

    // Left click selects (unless editing). Add explicit debug.
    el.addEventListener("click", (e)=>{
      if (dock.classList.contains("lock")) return;
      const path = e.composedPath ? e.composedPath() : [];
      if (path.includes(bar) || path.includes(barBtn)) return;
      console.info('[BP DEBUG] dock-chip:click', { id: String(opt.id) });
      selectByValue(opt.id, "dock-click");
    });

    // Right click -> inline rename
    el.addEventListener("contextmenu", (e)=>{
      if (dock.classList.contains("lock")) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const editorChip = buildInlineEditorChip(opt.name, (nextName)=>{
        window.dispatchEvent(new CustomEvent("bp:rename-request", { detail:{ id: opt.id, name: nextName } }));
        rebuild();
      }, ()=> rebuild());
      el.replaceWith(editorChip);
    });

    // Double click selects
    el.addEventListener("dblclick", (e)=>{
      if (dock.classList.contains("lock")) return;
      e.preventDefault();
      console.info('[BP DEBUG] dock-chip:dblclick', { id: String(opt.id) });
      selectByValue(opt.id, "dock-dblclick");
    });

    return el;
  }

  function mkAddChip(){
    const add = document.createElement("div");
    add.className = "chip add";
    add.textContent = "+";

    const setDisabledState = ()=>{
      if (bpCount() >= MAX_BLUEPRINTS) add.classList.add("disabled");
      else add.classList.remove("disabled");
    };
    setDisabledState();

    add.addEventListener("click", ()=>{
      if (dock.classList.contains("lock")) return;
      if (bpCount() >= MAX_BLUEPRINTS){
        toast(`Limit reached: ${MAX_BLUEPRINTS} blueprints. Delete one to add more.`);
        return;
      }
      const editorChip = buildInlineEditorChip("", (newName)=>{
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

  function currentOptions(){
    return Array.from(sel.querySelectorAll("option"))
      .map(o=>({ id:String(o.value), name:String(o.textContent || "") }))
      .filter(o=> o.id);
  }

  function rebuild(){
    const opts = currentOptions();
    list.replaceChildren();
    for (const o of opts) list.appendChild(mkChip(o));
    list.appendChild(mkAddChip());
    setActiveChip(sel.value);
  }

  rebuild();
  // Rebuild when <select> changes externally (list refresh)
  sel.addEventListener('change', rebuild);
})();
