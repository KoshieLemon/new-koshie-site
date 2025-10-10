// Providers for the bot-options UI.
// Sends guild_id and guild_name to the bot API.
// On save, splits UI data into { graph, script } for runtime execution.

import { BOT_BASE, USE_FIREBASE_CLIENT, gname } from './config.js';

function qs(guildId){
  return `guild_id=${encodeURIComponent(guildId)}&guild_name=${encodeURIComponent(gname||'')}`;
}

// Normalize payload so backend stores both visual graph and runnable script.
// - If bp.data.script exists, keep it.
// - Everything else becomes bp.data.graph.
// This is backward compatible with older saves that were a single blob.
function splitForSave(bp){
  const data = bp?.data || {};
  const script = (data && typeof data === 'object' && data.script) ? data.script : null;

  // Heuristics: if {graph} already present, keep it; else treat entire data as graph.
  const graph = (data && typeof data === 'object' && data.graph) ? data.graph : data;

  return {
    id: bp.id,
    name: bp.name || bp.id,
    data: { graph, script }
  };
}

class BotApiProvider {
  async listBlueprints(guildId){
    const r = await fetch(`${BOT_BASE}/blueprints?${qs(guildId)}`).catch(()=>null);
    if (!r || !r.ok) return null;
    return r.json();
  }
  async saveBlueprint(guildId, bp){
    const payload = splitForSave(bp);
    const r = await fetch(`${BOT_BASE}/blueprints?${qs(guildId)}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).catch(()=>null);
    return !!(r && r.ok);
  }
  async deleteBlueprint(guildId, id){
    const r = await fetch(`${BOT_BASE}/blueprints/${encodeURIComponent(id)}?${qs(guildId)}`,{
      method:'DELETE'
    }).catch(()=>null);
    return !!(r && r.ok);
  }
}

// Optional local or Firestore fallback if API unreachable.
// Firestore fallback expects window.firestore to be present.
class LocalProvider {
  key(g){ return `blueprints:${g}`; }
  async listBlueprints(g){ const raw = localStorage.getItem(this.key(g)); return raw ? JSON.parse(raw) : []; }
  async saveBlueprint(g,bp){
    const arr = (await this.listBlueprints(g)) || [];
    const norm = splitForSave(bp);
    const i = arr.findIndex(x=>x.id===norm.id);
    if (i>=0) arr[i]=norm; else arr.push(norm);
    localStorage.setItem(this.key(g), JSON.stringify(arr));
    return true;
  }
  async deleteBlueprint(g,id){
    const arr = (await this.listBlueprints(g)) || [];
    localStorage.setItem(this.key(g), JSON.stringify(arr.filter(x=>x.id!==id)));
    return true;
  }
}

class FirestoreProvider {
  constructor(){ this.db = window.firestore; }
  col(g){ return this.db.collection('guilds').doc(g).collection('blueprints'); }
  async listBlueprints(g){
    const snap = await this.col(g).get();
    return snap.docs.map(d=>({ id:d.id, name:d.data().name||d.id, data:d.data().data||{} }));
  }
  async saveBlueprint(g,bp){
    const norm = splitForSave(bp);
    await this.col(g).doc(norm.id).set({ name: norm.name, data: norm.data }, { merge:true });
    return true;
  }
  async deleteBlueprint(g,id){ await this.col(g).doc(id).delete(); return true; }
}

const Primary = new BotApiProvider();
const Fallback = USE_FIREBASE_CLIENT ? new FirestoreProvider() : new LocalProvider();

export async function listBlueprintsSafe(g){
  const a = await Primary.listBlueprints(g);
  return Array.isArray(a) ? a : Fallback.listBlueprints(g);
}
export async function saveBlueprintSafe(g,bp){
  const ok = await Primary.saveBlueprint(g,bp);
  return ok ? true : Fallback.saveBlueprint(g,bp);
}
export async function deleteBlueprintSafe(g,id){
  const ok = await Primary.deleteBlueprint(g,id);
  return ok ? true : Fallback.deleteBlueprint(g,id);
}
