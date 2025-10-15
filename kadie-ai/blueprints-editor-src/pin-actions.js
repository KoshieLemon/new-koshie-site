// Pin menu actions + capture-phase contextmenu handler
import { els } from './dom.js';
import { state, uid, pushHistory, markDirty } from './state.js';
import { renderAll } from './render.editor.js';
import { drawWires } from './render.wires.js';
import { unprojectClient } from './interactions.view.js';
import { colorKeyFor, toFinalPrimitive } from './render.types.js';
import { hideAllMenus } from './menu-manager.js'; // exclusivity :contentReference[oaicite:1]{index=1}
import { openPinMenu } from './pin-menu.js';

const DISCORD_OBJECT_RX =
  /(Client|Guild|User|GuildMember|Role|Message|Attachment|Webhook|Invite|Interaction|TextBasedChannel|VoiceBasedChannel|CategoryChannel)/;

function applyBreakObjectShape(nid, sourceType){
  const n = state.nodes.get(nid); if (!n) return;
  const baseIn  = [{ name:'in', type:'exec' }, { name:'object', type: sourceType || 'any' }];
  // Pull shape from global table if present; fall back to no-op
  const raw = (window.DISCORD_SHAPES && window.DISCORD_SHAPES[colorKeyFor(sourceType)]) || [];
  const finalDataPins = raw.map(f => ({ name:f.name, type: toFinalPrimitive(f.type) }));
  const outPins = [{ name:'out', type:'exec' }, ...finalDataPins];
  n._defOverride = {
    id:n.defId, name:'Break Object', category:'Utilities', kind:'exec', version:'1.0.0',
    inputs:baseIn, outputs:outPins, hasExecIn:true, hasExecOut:true,
    pins:{ in:baseIn, out:outPins }, params:baseIn, returns:outPins
  };
  renderAll();
}

function hasNodeDef(id){
  const list = (state.nodesIndex?.nodes || window.NODE_INDEX || []);
  return !!(list.find(d => d.id === id) || (window.NODE_DEFS && window.NODE_DEFS[id]));
}

function firstExistingDef(ids){
  for (const id of ids) if (hasNodeDef(id)) return id;
  return null;
}

// Capture-phase so node actions menu never opens over pins
document.addEventListener('contextmenu', (ev)=>{
  const pin = ev.target.closest?.('.pin.right'); // output pins only
  if (!pin) return;

  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  hideAllMenus(); // ensure exclusivity :contentReference[oaicite:2]{index=2}

  const pinType = pin.dataset.type || 'any';
  const breakable = DISCORD_OBJECT_RX.test(pinType);
  const pinName = pin.dataset.pin;
  const fromNodeEl = pin.closest('.node');
  const fromNid = fromNodeEl?.dataset?.nid;

  openPinMenu(ev.clientX, ev.clientY, {
    breakable,
    onBreak: () => {
      if (!breakable || !fromNid || !pinName) return;
      const world = unprojectClient(ev.clientX + 12, ev.clientY + 12);
      const breakNid = uid('N');
      state.nodes.set(breakNid, { id:breakNid, defId:'utils.breakObject', x:world.x-100, y:world.y-46, params:{} });

      const eid = uid('E');
      state.edges.set(eid, {
        id:eid,
        from:{ nid:fromNid, pin:pinName },
        to:{ nid:breakNid, pin:'object' },
        kind:'data',
        fromType: pinType,
        colorKey: colorKeyFor(pinType),
      });

      applyBreakObjectShape(breakNid, pinType);
      renderAll(); drawWires(); pushHistory(); markDirty(els.dirty);
    },
    onPromote: () => {
      // 1) create variable in dock
      const vName = String(pinName || 'var');
      window.dispatchEvent(new CustomEvent('variables:add', {
        detail:{ name:vName, type: toFinalPrimitive(pinType) }
      }));

      // 2) try to drop a "set variable" node and wire it
      const defId = firstExistingDef([
        'variables.set', 'runtime.setVariable', 'kadie.setVariable', 'kadieai.setVariable'
      ]);
      if (!defId || !fromNid || !pinName) return;

      const world = unprojectClient(ev.clientX + 28, ev.clientY + 28);
      const setNid = uid('N');
      state.nodes.set(setNid, { id:setNid, defId, x:world.x-100, y:world.y-46, params:{ name:vName } });

      const eid = uid('E');
      state.edges.set(eid, {
        id:eid,
        from:{ nid:fromNid, pin:pinName },
        to:{ nid:setNid, pin:'value' },   // assumes 'value' input on set node
        kind:'data',
        fromType: pinType,
        colorKey: colorKeyFor(pinType),
      });

      renderAll(); drawWires(); pushHistory(); markDirty(els.dirty);
    }
  });
}, true);
