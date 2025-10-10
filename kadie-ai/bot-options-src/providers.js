import { BOT_BASE, USE_FIREBASE_CLIENT, gname } from './config.js';

class BotApiProvider {
  async listBlueprints(guildId){
    const qs = `guild_id=${encodeURIComponent(guildId)}&guild_name=${encodeURIComponent(gname||'')}`;
    const r = await fetch(`${BOT_BASE}/blueprints?${qs}`).catch(()=>null);
    if (!r || !r.ok) return null;
    return r.json();
  }
  async saveBlueprint(guildId, bp){
    const qs = `guild_id=${encodeURIComponent(guildId)}&guild_name=${encodeURIComponent(gname||'')}`;
    const r = await fetch(`${BOT_BASE}/blueprints?${qs}`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bp)
    }).catch(()=>null);
    return !!(r && r.ok);
  }
  async deleteBlueprint(guildId, id){
    const qs = `guild_id=${encodeURIComponent(guildId)}&guild_name=${encodeURIComponent(gname||'')}`;
    const r = await fetch(`${BOT_BASE}/blueprints/${encodeURIComponent(id)}?${qs}`,{method:'DELETE'}).catch(()=>null);
    return !!(r && r.ok);
  }
}

class LocalProvider {
  key(g){ return `blueprints:${g}`; }
  async listBlueprints(g){ const raw = localStorage.getItem(this.key(g)); return raw ? JSON.parse(raw) : []; }
  async saveBlueprint(g,bp){
    const arr = (await this.listBlueprints(g)) || [];
    const i = arr.findIndex(x=>x.id===bp.id); if (i>=0) arr[i]=bp; else arr.push(bp);
    localStorage.setItem(this.key(g), JSON.stringify(arr)); return true;
  }
  async deleteBlueprint(g,id){
    const arr = (await this.listBlueprints(g)) || [];
    localStorage.setItem(this.key(g), JSON.stringify(arr.filter(x=>x.id!==id))); return true;
  }
}

class FirestoreProvider {
  constructor(){ this.db = window.firestore; }
  col(g){ return this.db.collection('guilds').doc(g).collection('blueprints'); }
  async listBlueprints(g){ const snap = await this.col(g).get(); return snap.docs.map(d=>({ id:d.id, name:d.data().name||d.id, data:d.data().data||{} })); }
  async saveBlueprint(g,bp){ await this.col(g).doc(bp.id).set({ name: bp.name, data: bp.data }, { merge:true }); return true; }
  async deleteBlueprint(g,id){ await this.col(g).doc(id).delete(); return true; }
}

const Provider = new BotApiProvider();
const Fallback = USE_FIREBASE_CLIENT ? new FirestoreProvider() : new LocalProvider();

export async function listBlueprintsSafe(g){ const a = await Provider.listBlueprints(g); return Array.isArray(a) ? a : Fallback.listBlueprints(g); }
export async function saveBlueprintSafe(g,bp){ const ok = await Provider.saveBlueprint(g,bp); return ok ? true : Fallback.saveBlueprint(g,bp); }
export async function deleteBlueprintSafe(g,id){ const ok = await Provider.deleteBlueprint(g,id); return ok ? true : Fallback.deleteBlueprint(g,id); }
