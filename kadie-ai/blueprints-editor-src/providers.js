// Kadie AI editor <-> kadie-ai-node API adapter

import { BOT_BASE as API, gname } from "./config.js";

/* ---------------- helpers ---------------- */
function qs(guildId) {
  return `guild_id=${encodeURIComponent(guildId)}&guild_name=${encodeURIComponent(
    gname || ""
  )}`;
}

async function http(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...opts,
  });
  const text = await res.text().catch(() => "");
  const ctype = res.headers.get("content-type") || "";

  if (!res.ok) {
    console.error("[providers]", opts.method || "GET", path, res.status, text);
    throw new Error(`HTTP ${res.status}`);
  }
  if (ctype.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
  return text || null;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || `bp-${Date.now()}`;
}

function normalizeItem(x, fallbackId) {
  if (!x) return null;
  const id = x.id ?? fallbackId;
  const name = x.name ?? id;
  const graph = x.data?.graph ?? x.graph ?? x.data ?? { nodes: [], edges: [] };
  const script = x.data?.script ?? x.script ?? null;
  return { id, name, data: { graph, script } };
}

/* ---------------- API ---------------- */
export async function listBlueprints(guildId) {
  const payload = await http(`/blueprints?${qs(guildId)}`);
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
    ? payload.items
    : [];
  return arr.map((x) => ({ id: x.id || x.name, name: x.name || x.id }));
}

export async function openBlueprint(guildId, idOrName) {
  const key = String(idOrName);
  const keyL = key.toLowerCase();

  const res = await http(
    `/blueprints?id=${encodeURIComponent(key)}&${qs(guildId)}`
  );
  const arr = Array.isArray(res) ? res : res ? [res] : [];

  let pick =
    arr.find((x) => String(x?.id || "").toLowerCase() === keyL) ||
    arr.find((x) => String(x?.name || "").toLowerCase() === keyL);

  if (!pick) {
    const all = await http(`/blueprints?${qs(guildId)}`);
    const items = Array.isArray(all)
      ? all
      : Array.isArray(all?.items)
      ? all.items
      : [];
    pick =
      items.find((x) => String(x?.id || "").toLowerCase() === keyL) ||
      items.find((x) => String(x?.name || "").toLowerCase() === keyL) ||
      null;
  }

  if (!pick) return null;
  return normalizeItem(pick, key);
}

export async function createBlueprint(guildId, { name }) {
  const display = (name && name.trim()) || `Blueprint ${new Date().toLocaleString()}`;
  const id = slugify(display);
  const payload = {
    id,
    name: display,               // spaces preserved
    data: { graph: { nodes: [], edges: [] }, script: null },
  };
  const res = await http(`/blueprints?${qs(guildId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: res?.id || id, name: res?.name || display };
}

export async function renameBlueprint(guildId, { id, name }) {
  // Some backends don't support PATCH; use POST upsert first.
  const body = JSON.stringify({ id, name });
  try {
    await http(`/blueprints?${qs(guildId)}`, { method: "POST", body }); // upsert
    return true;
  } catch {
    // Fallback to PATCH /blueprints/:id
    try {
      await http(`/blueprints/${encodeURIComponent(id)}?${qs(guildId)}`, {
        method: "PATCH",
        body,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function deleteBlueprint(guildId, { id }) {
  try {
    await http(`/blueprints/${encodeURIComponent(id)}?${qs(guildId)}`, {
      method: "DELETE",
    });
  } catch {
    await http(
      `/blueprints?id=${encodeURIComponent(id)}&${qs(guildId)}`,
      { method: "DELETE" }
    );
  }
  return true;
}

export async function saveBlueprint(guildId, bp) {
  const data = bp?.data ?? {};
  const payload = {
    id: bp.id,
    name: bp.name || bp.id,      // spaces preserved
    data: { graph: data.graph ?? data, script: data.script ?? null },
  };
  await http(`/blueprints?${qs(guildId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return true;
}
