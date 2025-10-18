// blueprints.ctx.js
// Busy overlay, logging, and shared sequencing.

import { els } from '../core/dom.js';

export let BUSY = false;
let _loadSeq = 0;

export function stepLog(n, label, status, extra){
  const tail = extra ? ` | ${extra}` : '';
  console.info(`[BP STEP ${n}] ${label}: ${status}${tail}`);
}

export function ensureBusyUI(){
  if (document.getElementById('bp-busy-style')) return;

  const css = document.createElement('style');
  css.id = 'bp-busy-style';
  css.textContent = `
    #appBusy{
      position:fixed; inset:0; z-index:2000;
      display:none; align-items:center; justify-content:center;
      background:rgba(10,12,18,.62); backdrop-filter:blur(2px);
      cursor:progress; pointer-events:all;
    }
    #appBusy .wrap{ display:flex; flex-direction:column; align-items:center; gap:10px; }
    #appBusy .spinner{
      width:56px; height:56px; border-radius:50%;
      border:4px solid #3b82f6; border-top-color:transparent;
      animation:bpSpin .9s linear infinite; box-shadow:0 0 18px #3b82f688;
    }
    #appBusy .msg{
      color:#e5e7eb; font:600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; opacity:.95;
    }
    @keyframes bpSpin{ to{ transform:rotate(360deg) } }
  `;
  document.head.appendChild(css);

  const ov = document.createElement('div');
  ov.id = 'appBusy';
  ov.innerHTML = `<div class="wrap"><div class="spinner"></div><div class="msg">Loading blueprint…</div></div>`;
  document.body.appendChild(ov);

  const stopAll = (e)=>{ if (BUSY) { e.preventDefault(); e.stopPropagation(); } };
  window.addEventListener('pointerdown', stopAll, true);
  window.addEventListener('wheel', stopAll, { passive:false, capture:true });
  window.addEventListener('keydown', stopAll, true);
}

export function showBusy(text='Loading blueprint…'){
  ensureBusyUI();
  BUSY = true;
  const el = document.getElementById('appBusy');
  if (el){
    const msg = el.querySelector('.msg');
    if (msg) msg.textContent = text;
    el.style.display = 'flex';
  }
}

export function hideBusy(){
  BUSY = false;
  const el = document.getElementById('appBusy');
  if (el) el.style.display = 'none';
}

export function nextLoadSeq(){ _loadSeq += 1; return _loadSeq; }
export function currentLoadSeq(){ return _loadSeq; }
