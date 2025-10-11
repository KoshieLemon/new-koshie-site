// bot-options-src/providers.js
// Kadie AI editor <-> kadie-ai-node API adapter.
// Uses correct query key `guild_id` and always sends {id, name} on create.
// Saves payload as { data: { graph, script } }.

/* eslint-disable no-console */
import { BOT_BASE as API, gname } from './config.js';

// ---------- helpers ----------
function qs(guildId) {
  return `guild_id=${encodeURIComponent(guildId)}&guild_name=${encodeURIComponent(gname || '')}`;
}

async function http(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    ...opts,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[providers]', opts.method || 'GET', path, res.status, text);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `bp-${Date.now()}`;
}

// Normalize save format: { data: { graph, script } }
function splitForSave(bp) {
  const data = bp?.data ?? {};
  const script = data?.script ?? null;
  const graph = data?.graph ?? data; // backward compat when UI stores plain graph
  return { id: bp.id, name: bp.name || bp.id, data: { graph, script } };
}

// ---------- API ----------
export async function listBlueprints(guildId) {
  const payload = await http(`/blueprints?${qs(guildId)}`);
  const arr = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return arr.map(x => ({ id: x.id || x.name, name: x.name || x.id }));
}

export async function openBlueprint(guildId, id) {
  const data = await http(`/blueprints?id=${encodeURIComponent(id)}&${qs(guildId)}`);
  const bp = Array.isArray(data) ? data[0] : data;
  if (!bp) return null;

  // accept either {graph} at top-level or nested under data
  const graph = bp.data?.graph ?? bp.graph ?? bp.data ?? null;
  const script = bp.data?.script ?? bp.script ?? null;

  return { id: bp.id || id, name: bp.name || id, data: { graph, script } };
}

export async function createBlueprint(guildId, { name }) {
  const display = (name && name.trim()) ? name.trim() : `Blueprint ${new Date().toLocaleString()}`;
  const id = slugify(display);
  const payload = {
    id,
    name: display,
    data: { graph: { nodes: [], edges: [] }, script: null }
  };
  const res = await http(`/blueprints?${qs(guildId)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return { id: res?.id || id, name: res?.name || display };
}

export async function renameBlueprint(guildId, { id, name }) {
  await http(`/blueprints?${qs(guildId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ id, name })
  });
  return true;
}

export async function deleteBlueprint(guildId, { id }) {
  try {
    await http(`/blueprints/${encodeURIComponent(id)}?${qs(guildId)}`, { method: 'DELETE' });
  } catch {
    await http(`/blueprints?id=${encodeURIComponent(id)}&${qs(guildId)}`, { method: 'DELETE' });
  }
  return true;
}

export async function saveBlueprint(guildId, bp) {
  const payload = splitForSave(bp);
  await http(`/blueprints?${qs(guildId)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return true;
}
