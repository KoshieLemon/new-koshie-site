// Saving blueprint payload with node params included.
import { api } from "../../assets/api.js";
import { exportBlueprint } from "./state.js";

export async function saveBlueprint(guildId, blueprintId) {
  const payload = exportBlueprint();
  const res = await api.post(`/blueprints/${guildId}/${blueprintId}`, payload);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`saveBlueprint failed: ${res.status} ${txt}`);
  }
  return true;
}
