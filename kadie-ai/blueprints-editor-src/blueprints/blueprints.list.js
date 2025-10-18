// blueprints.list.js
// Fetch and paint select list without auto-selecting anything.

import { els } from '../core/dom.js';
import { listBlueprints } from '../providers/providers.js';
import { ensureNodesIndex } from '../providers/nodes-index.js';
import { canonicalId } from './blueprints.util.js';

export async function refreshList(gid, selectId=null){
  await ensureNodesIndex();
  const sel = els.bpSelect;
  const list = await listBlueprints(gid);

  sel.innerHTML = '';
  for (const bp of list){
    const o = document.createElement('option');
    o.value = bp.id;
    o.textContent = bp.name || bp.id;
    sel.appendChild(o);
  }

  if (selectId !== null) sel.value = canonicalId(selectId);
}
