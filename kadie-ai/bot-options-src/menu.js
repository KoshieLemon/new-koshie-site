import { els } from './dom.js';
import { fetchNodesIndex, groupNodesByCategory } from './nodes-index.js';

export async function openContextMenu(x,y,onChoose){
  const idx = await fetchNodesIndex();
  const tree = groupNodesByCategory(idx.nodes || []);
  els.ctxMenu.style.left = x+'px';
  els.ctxMenu.style.top = y+'px';
  els.ctxMenu.innerHTML = '';
  buildTree(els.ctxMenu, tree, [], onChoose);
  els.ctxMenu.style.display='block';
  window.addEventListener('click', hideOnce, { once:true });
}
function hideOnce(){ document.getElementById('ctx')?.style && (document.getElementById('ctx').style.display='none'); }

function buildTree(root, node, path, onChoose){
  for (const [k,v] of Object.entries(node)){
    if (k==='__leaf') continue;
    if (v.__leaf){
      const item = document.createElement('div');
      item.className='menu-item';
      item.textContent = [...path, k].join('.');
      item.setAttribute('draggable','true');
      const defId = v.__leaf.id;
      item.addEventListener('dragstart',(e)=>{ e.dataTransfer.setData('text/x-node-id', defId); });
      item.addEventListener('click',()=>{ onChoose(defId); document.getElementById('ctx').style.display='none'; });
      root.appendChild(item);
    } else {
      const h = document.createElement('h4'); h.textContent = [...path, k].join('/');
      root.appendChild(h);
      const sub = document.createElement('div'); sub.className='submenu';
      root.appendChild(sub);
      buildTree(sub, v, [...path, k], onChoose);
    }
  }
}
