// variables-typepicker.js
// Searchable type picker with Single/Array/Map modes.

import { typeColor } from './variables-ctx.js';

export function createTypePicker(allTypes){
  let ui = null;
  function ensure(){
    if (ui) return ui;
    const root = document.createElement('div');
    root.id = 'var-type-picker';
    Object.assign(root.style, {
      position:'fixed', zIndex: 2147483647, display:'none',
      minWidth:'280px', maxWidth:'420px', maxHeight:'60vh', overflow:'auto',
      background:'#0a0f19', color:'#e5e7eb', border:'1px solid #1f2937',
      borderRadius:'10px', boxShadow:'0 14px 36px rgba(0,0,0,.6)', padding:'8px'
    });

    const search = document.createElement('input');
    Object.assign(search.style, {
      width:'100%', boxSizing:'border-box', padding:'6px 8px',
      border:'1px solid #2b2f3a', borderRadius:'8px', background:'#0f1117', color:'#e5e7eb',
      marginBottom:'8px'
    });
    search.placeholder = 'Search types…';

    const seg = document.createElement('div');
    Object.assign(seg.style, { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'6px', marginBottom:'8px' });
    function mkSeg(text){ const b=document.createElement('button');
      b.textContent=text; Object.assign(b.style,{
        border:'1px solid #2b2f3a', background:'#11131a', color:'#e5e7eb',
        padding:'6px 8px', borderRadius:'8px', cursor:'pointer'
      }); return b; }
    const segSingle = mkSeg('Single'), segArray = mkSeg('Array'), segMap = mkSeg('Map');
    seg.append(segSingle, segArray, segMap);
    function setSeg(which){
      [segSingle,segArray,segMap].forEach(b=>{
        b.style.background = (b===which)?'#1d4ed8':'#11131a';
        b.style.borderColor = (b===which)?'#1e40af':'#2b2f3a';
      });
    }

    const list = document.createElement('div');
    Object.assign(list.style, { display:'grid', gridTemplateColumns:'1fr', gap:'4px' });

    let onCommit = null;
    let currentMode = 'single';

    function paintList(){
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      const items = allTypes.filter(t=>!q || t.toLowerCase().includes(q));
      for (const t of items){
        const btn = document.createElement('button');
        btn.textContent = t;
        Object.assign(btn.style,{
          textAlign:'left', border:'1px solid #2b2f3a', background:'#0f1117',
          color:'#e5e7eb', padding:'6px 8px', borderRadius:'8px', cursor:'pointer'
        });
        btn.onmouseenter = ()=> btn.style.background='#0c1730';
        btn.onmouseleave = ()=> btn.style.background='#0f1117';
        btn.onclick = ()=> {
          if (!onCommit) return;
          let final = t;
          if (currentMode==='array') final = `${t}[]`;
          else if (currentMode==='map') final = `map<${t}>`;
          onCommit(final);
          close();
        };
        list.appendChild(btn);
      }
    }

    function openAt(clientX, clientY, currentType, commit){
      onCommit = commit;
      // infer mode from currentType
      currentMode = currentType?.endsWith('[]') ? 'array'
                  : /^map<.+>$/.test(currentType||'') ? 'map'
                  : 'single';
      setSeg(currentMode==='single'?segSingle:currentMode==='array'?segArray:segMap);

      search.value=''; paintList();
      root.style.left='-9999px'; root.style.top='-9999px'; root.style.display='block';
      const mw = root.offsetWidth, mh = root.offsetHeight;
      const vw = innerWidth, vh = innerHeight, pad = 8;
      let left = clientX + 12, top = clientY + 12;
      if (left + mw > vw - pad) left = clientX - mw - 12;
      if (top  + mh > vh - pad) top  = clientY - mh - 12;
      left = Math.min(vw - pad - mw, Math.max(pad, left));
      top  = Math.min(vh - pad - mh, Math.max(pad, top));
      root.style.left = `${left}px`;
      root.style.top  = `${top}px`;
      setTimeout(()=> search.focus(), 0);

      const outside = (ev)=>{ if (!root.contains(ev.target)) { close(); cleanup(); } };
      const onKey   = (ev)=>{ if (ev.key==='Escape') { close(); cleanup(); }
                              if (ev.key==='Enter'){ const first=list.querySelector('button'); if(first){ first.click(); cleanup(); } } };
      function cleanup(){
        window.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('keydown', onKey, true);
      }
      window.addEventListener('pointerdown', outside, true);
      window.addEventListener('keydown', onKey, true);
    }

    function close(){ root.style.display='none'; }

    search.addEventListener('input', paintList);
    segSingle.onclick = ()=>{ currentMode='single'; setSeg(segSingle); };
    segArray .onclick = ()=>{ currentMode='array';  setSeg(segArray); };
    segMap   .onclick = ()=>{ currentMode='map';    setSeg(segMap);   };

    root.append(search, seg, list);
    document.body.appendChild(root);
    ui = { root, openAt, close };
    return ui;
  }

  return {
    open(clientX, clientY, currentType, commit){
      ensure().openAt(clientX, clientY, currentType, commit);
    }
  };
}
