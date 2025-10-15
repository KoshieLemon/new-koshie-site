import { requestOpen, notifyClosed } from './menu-manager.js'; // :contentReference[oaicite:3]{index=3}

(function styles(){
  if (document.getElementById('ctx-pin-styles')) return;
  const s = document.createElement('style');
  s.id = 'ctx-pin-styles';
  s.textContent = `
    #ctx-pin{position:fixed;z-index:2147483647;display:none;background:#0a0f19;color:#e5e7eb;
      border:1px solid #1f2937;border-radius:8px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:4px;min-width:180px}
    #ctx-pin .item{padding:6px 10px;cursor:pointer;border-radius:6px;user-select:none}
    #ctx-pin .item:hover{background:#0c1730}
    #ctx-pin .sep{height:1px;margin:4px 0;background:#0f172a}
  `;
  document.head.appendChild(s);
})();

let root=null, btnBreak=null, btnPromote=null, outside=null;

function ensure(){
  if (root) return;
  root = document.createElement('div'); root.id = 'ctx-pin';
  btnBreak   = document.createElement('div'); btnBreak.className='item';   btnBreak.textContent='Break Object';
  const sep  = document.createElement('div'); sep.className='sep';
  btnPromote = document.createElement('div'); btnPromote.className='item'; btnPromote.textContent='Promote to variable';
  root.append(btnBreak, sep, btnPromote);
  document.body.appendChild(root);
}

function pinToViewport(x,y){
  root.style.left='0px'; root.style.top='0px'; root.style.display='block';
  const mw=root.offsetWidth, mh=root.offsetHeight, vw=innerWidth, vh=innerHeight, pad=8;
  let l=x, t=y; if (x+mw>vw-pad) l=Math.max(pad, x-mw); if (l<pad) l=pad;
  if (y+mh>vh-pad) t=Math.max(pad, y-mh); if (t<pad) t=pad;
  root.style.left=l+'px'; root.style.top=t+'px';
}

export function hidePinMenu(){
  if (!root) return;
  root.style.display='none';
  if (outside){
    window.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('wheel', outside, true);
    window.removeEventListener('keydown', outside, true);
    outside=null;
  }
  notifyClosed('pin');
}

export function openPinMenu(x, y, { breakable=true, onBreak, onPromote } = {}){
  ensure();
  requestOpen('pin', hidePinMenu); // make exclusive with other menus :contentReference[oaicite:4]{index=4}
  btnBreak.style.display = breakable ? '' : 'none';
  root.style.display='block';
  pinToViewport(x, y);

  btnBreak.onclick   = ()=>{ hidePinMenu(); onBreak && onBreak(); };
  btnPromote.onclick = ()=>{ hidePinMenu(); onPromote && onPromote(); };

  outside = (ev)=>{ if (ev.type==='keydown' && ev.key==='Escape'){ hidePinMenu(); return; }
                    if (!root.contains(ev.target)) hidePinMenu(); };
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('wheel', outside, true);
  window.addEventListener('keydown', outside, true);
}
