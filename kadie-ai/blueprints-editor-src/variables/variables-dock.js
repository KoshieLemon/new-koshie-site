// variables-dock.js
// Orchestrator: DOM wiring, resizing, persistence, type picker, and actions.

import { BOT_BASE, gid } from '../core/config.js';
import { markDirty, clearDirty } from '../core/state.js';
import { VDock, KEYS, LAYOUT } from './variables-ctx.js';
import { createTypePicker } from './variables-typepicker.js';
import { renderDock } from './variables-render.js';
import { loadVariables, saveVariables, loadGuildData } from './variables-api.js';

// All supported base types
const ALL_TYPES = [
  'boolean','string','int','float','number','bigint','json','buffer','stream','date',
  'timestamp_ms','duration_ms','url','color',
  'snowflake','guildId','channelId','userId','memberId','roleId','messageId','emojiId','webhookId','applicationId','interactionId',
  'Client','Guild','User','GuildMember','Role','Message','Attachment','Webhook','Invite',
  'TextBasedChannel','TextChannel','ThreadChannel','DMChannel','NewsChannel','ForumChannel',
  'VoiceBasedChannel','VoiceChannel','StageChannel',
  'CategoryChannel',
  'Interaction','ChatInputCommandInteraction','MessageComponentInteraction','ModalSubmitInteraction','AutocompleteInteraction',
  'MessageContent','Embed','ComponentRow','AllowedMentions','MessageReference','AttachmentInput','TTS',
  'Permissions','IntentFlags',
];

(function init(){
  // DOM
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
  if (!els.dock || !els.list || !els.addBtn || !els.editor){ console.warn('[variables-dock] required DOM missing'); return; }

  // Bind context
  VDock.els = els;
  VDock.gid = gid || null;
  VDock.BOT_BASE = BOT_BASE || '';

  // Minor dock aesthetics
  Object.assign(els.dock.style, { background:'#0a0f19', borderLeft:'1px solid #132133' });

  // Width resizer
  const clamp = (n,min,max)=> Math.max(min, Math.min(max, n));
  const savedW = Number(localStorage.getItem(KEYS.WIDTH) || 0);
  if (savedW) els.dock.style.width = `${clamp(savedW, LAYOUT.MIN_W, LAYOUT.MAX_W)}px`;

  if (els.resizer){
    let active = false;
    const onMove = (e)=>{
      if (!active) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      const fromRight = window.innerWidth - x - parseFloat(getComputedStyle(els.dock).right || '12');
      const w = clamp(fromRight, LAYOUT.MIN_W, LAYOUT.MAX_W);
      els.dock.style.width = `${w}px`;
    };
    const onUp = ()=>{
      if (!active) return;
      active = false; els.dock.classList.remove('resizing');
      localStorage.setItem(KEYS.WIDTH, String(parseFloat(els.dock.style.width) || 0));
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

  // Height sync
  function ensureHeight(){
    const h = els.editor?.getBoundingClientRect().height || Math.round(window.innerHeight * 0.68);
    els.dock.style.maxHeight = `${h}px`;
    els.dock.style.height = `${h}px`;
    els.dock.style.overflow = 'auto';
  }
  ensureHeight();
  window.addEventListener('resize', ensureHeight);

  // Dirty state
  function setVarsDirty(d){
    VDock.varsDirty = !!d;
    if (VDock.varsDirty) markDirty(els.dirty);
  }

  // Expose hooks for renderer
  window.__VDock_setVarsDirty = setVarsDirty;
  window.__VDock_addVar = (v)=>{ VDock.VARS.push(v); setVarsDirty(true); renderDock(); };
  window.__VDock_removeVar = (idx)=>{
    const victim = VDock.VARS[idx];
    if (victim?.name) {
      if (!Array.isArray(VDock.DELETED)) VDock.DELETED = [];
      VDock.DELETED.push(String(victim.name));
    }
    VDock.VARS = VDock.VARS.filter((_,i)=> i !== idx);
    setVarsDirty(true);
    renderDock();
  };

  // Type picker
  const typePicker = createTypePicker(ALL_TYPES);
  window.__VDock_openTypePicker = (idx, clientX, clientY)=>{
    const cur = VDock.VARS[idx]?.type || 'string';
    typePicker.open(clientX, clientY, cur, (finalType)=>{
      if (VDock.VARS[idx]){ VDock.VARS[idx].type = finalType; setVarsDirty(true); renderDock(); }
    });
  };

  // Actions
  els.addBtn.addEventListener('click', ()=>{ window.__VDock_addVar({ name: nextVarName('NewVar'), type:'string' }); });
  els.bpSelect?.addEventListener('change', ()=> renderDock());
  if (els.search) els.search.addEventListener('input', renderDock);

  els.saveBtn?.addEventListener('click', async ()=>{
    if (!VDock.varsDirty) return;
    const ok = await saveVariables();
    if (ok){ setVarsDirty(false); clearDirty(els.dirty); }
    else { console.warn('[variables-dock] save failed on all URLs; keeping dirty state'); }
  });
  els.revertBtn?.addEventListener('click', ()=>{
    if (!VDock.varsDirty) return;
    VDock.VARS = JSON.parse(JSON.stringify(VDock.SNAP));
    VDock.DELETED = []; // drop tombstones on revert
    setVarsDirty(false);
    clearDirty(els.dirty);
    renderDock();
  });

  // External add
  window.addEventListener('variables:add', (e)=>{
    const { name, type } = e.detail || {};
    if (!name || !type) return;
    window.__VDock_addVar({ name: nextVarName(String(name)), type: String(type) });
  });

  function nextVarName(base){
    const taken = new Set(VDock.VARS.map(z=>z.name));
    let n = String(base||'').replace(/[^a-zA-Z0-9_]+/g,'_').replace(/^_+|_+$/g,'') || 'Var';
    if (!taken.has(n)) return n;
    let i = 2; while (taken.has(`${n}_${i}`)) i++; return `${n}_${i}`;
  }

  // Boot
  (async function bootstrap(){
    try{
      if (VDock.gid){
        await loadGuildData();
        console.log('%c[variables-dock] guild loaded','color:#22c55e', {
          channels: VDock.FULL.channels.length,
          roles: VDock.FULL.roles.length,
          messages: VDock.FULL.messages.length||0
        });
      }
    }catch(err){
      console.error('[variables-dock] guild load failed', err);
    }finally{
      renderDock();
    }

    await loadVariables();
    renderDock();
  })();

})();
