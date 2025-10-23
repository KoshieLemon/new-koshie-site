// Lightweight bottom toast system. Auto-injects CSS and container.
// Usage: import { toast } from "./notify.js"; toast("message", { kind:"error", ms:4000 });

let injected = false;

function ensureCSS() {
  if (injected) return;
  injected = true;
  const css = `
  .kadie-toast-wrap{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2000;pointer-events:none}
  .kadie-toast{
    min-width:260px;max-width:80vw;margin-top:8px;padding:10px 12px;border-radius:10px;
    font:600 12px/1.2 system-ui, Segoe UI, Roboto, Arial, sans-serif;
    border:1px solid #372020;background:#1b0e0e;color:#fecaca;box-shadow:0 10px 28px #000a;
    opacity:0;transform:translateY(8px);transition:opacity .18s ease, transform .18s ease;
    pointer-events:auto
  }
  .kadie-toast.show{opacity:1;transform:translateY(0)}
  .kadie-toast.info { background:#0f1523; border-color:#1e2a44; color:#dbeafe }
  .kadie-toast.warn { background:#231e0e; border-color:#3f3417; color:#fde68a }
  `;
  const tag = document.createElement('style'); tag.textContent = css; document.head.appendChild(tag);
}

function host() {
  let el = document.querySelector('.kadie-toast-wrap');
  if (!el) { el = document.createElement('div'); el.className = 'kadie-toast-wrap'; document.body.appendChild(el); }
  return el;
}

export function toast(msg, { kind = 'error', ms = 4200 } = {}) {
  try {
    ensureCSS();
    const wrap = host();
    const item = document.createElement('div');
    item.className = `kadie-toast ${kind}`;
    item.setAttribute('role','status');
    item.setAttribute('aria-live','polite');
    item.textContent = String(msg || '');
    wrap.appendChild(item);
    requestAnimationFrame(()=> item.classList.add('show'));
    const t = setTimeout(()=> {
      item.classList.remove('show');
      item.addEventListener('transitionend', ()=> item.remove(), { once:true });
    }, Math.max(1500, Number(ms)||4000));
    // manual dismiss
    item.addEventListener('click', ()=> { clearTimeout(t); item.classList.remove('show'); item.addEventListener('transitionend', ()=> item.remove(), { once:true }); });
  } catch {}
}

export function showError(msg, opts={}) { return toast(msg, { ...opts, kind:'error' }); }
export function showInfo(msg, opts={})  { return toast(msg, { ...opts, kind:'info'  }); }
export function showWarn(msg, opts={})  { return toast(msg, { ...opts, kind:'warn'  }); }
