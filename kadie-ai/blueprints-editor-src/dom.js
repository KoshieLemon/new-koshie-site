export const els = {
  gname: document.getElementById('gname'),
  gmeta: document.getElementById('gmeta'),
  gicon: document.getElementById('gicon'),
  editor: document.getElementById('editor'),
  nodesLayer: document.getElementById('nodes'),
  wiresSvg: document.getElementById('wires'),
  overlay: document.getElementById('disabledOverlay'),
  ctxMenu: document.getElementById('ctx'),
  dirty: document.getElementById('dirty'),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  saveBtn: document.getElementById('saveBtn'),
  revertBtn: document.getElementById('revertBtn'),
  bpSelect: document.getElementById('bpSelect'),
  bpCreate: document.getElementById('bpCreate'),
  bpRename: document.getElementById('bpRename'),
  bpDelete: document.getElementById('bpDelete'),
  rubber: document.getElementById('rubber') || null
};

export function setGuildHeader({ gid, gname, gicon, total, online }){
  if (els.gname) els.gname.textContent = gname || '(unnamed)';
  if (els.gicon){
    if (gicon){
      els.gicon.src = `https://cdn.discordapp.com/icons/${gid}/${gicon}.png?size=128`;
      els.gicon.alt = gname || 'icon';
    } else {
      els.gicon.removeAttribute('src');
    }
  }
  const parts = [`ID: ${gid || '(unknown)'}`];
  if (typeof online === 'number' && !Number.isNaN(online)) parts.push(`${online} online`);
  if (typeof total === 'number' && !Number.isNaN(total)) parts.push(`${total} members`);
  if (els.gmeta) els.gmeta.textContent = parts.join(' • ');
}
