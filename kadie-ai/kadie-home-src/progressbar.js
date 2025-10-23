import { byId } from './utils.js';

const cpuSlot = byId('cpuSlot');
const cpuFill = byId('cpuFill');
const cpuMax  = byId('cpuMax');

export function setCpuBar(current, max){
  const cur = Math.max(0, Number(current) || 0);
  const mx  = Math.max(0, Number(max) || 0);
  const pct = mx > 0 ? Math.max(0, Math.min(100, Math.round((cur / mx) * 100))) : 0;
  if (cpuFill) cpuFill.style.width = pct + '%';
  if (cpuMax)  cpuMax.textContent  = String(mx);
  if (cpuSlot) cpuSlot.title       = `${cur}/${mx}`;
}
