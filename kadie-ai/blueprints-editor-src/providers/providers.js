// Kadie.AI — Providers (FULL FILE)
// Self-contained: shows bottom notifications from here. No external toast deps.

import { BOT_BASE as API, gname } from "../core/config.js";

/* =======================================================================================
 * Inline bottom toast (no imports)
 * =======================================================================================
 */
const __kadieToast = (() => {
  let injected = false;
  function ensureCSS() {
    if (injected) return; injected = true;
    const s = document.createElement("style");
    s.textContent = `
.kadie-toast-wrap{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2000;pointer-events:none}
.kadie-toast{
  min-width:260px;max-width:80vw;margin-top:8px;padding:10px 12px;border-radius:10px;
  font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif;
  border:1px solid #372020;background:#1b0e0e;color:#fecaca;box-shadow:0 10px 28px #000a;
  opacity:0;transform:translateY(8px);transition:opacity .18s ease, transform .18s ease;pointer-events:auto
}
.kadie-toast.show{opacity:1;transform:translateY(0)}
.kadie-toast.info { background:#0f1523; border-color:#1e2a44; color:#dbeafe }
.kadie-toast.warn { background:#231e0e; border-color:#3f3417; color:#fde68a }
`;
    document.head.appendChild(s);
  }
  function host() {
    let el = document.querySelector(".kadie-toast-wrap");
    if (!el) { el = document.createElement("div"); el.className = "kadie-toast-wrap"; document.body.appendChild(el); }
    return el;
  }
  return function show(msg, kind="error", ms=4200){
    try{
      ensureCSS();
      const wrap = host();
      const n = document.createElement("div");
      n.className = `kadie-toast ${kind}`;
      n.setAttribute("role","status"); n.setAttribute("aria-live","polite");
      n.textContent = String(msg || "");
      wrap.appendChild(n);
      requestAnimationFrame(()=> n.classList.add("show"));
      const t = setTimeout(()=>{ n.classList.remove("show"); n.addEventListener("transitionend",()=>n.remove(),{once:true}); }, Math.max(1500, ms|0||4200));
      n.addEventListener("click", ()=>{ clearTimeout(t); n.classList.remove("show"); n.addEventListener("transitionend",()=>n.remove(),{once:true}); });
    }catch{}
  };
})();

/* =======================================================================================
 * Config
 * =======================================================================================
 */
const MAX_BLUEPRINTS = 10;
const MAX_NODES = 70;

/* =======================================================================================
 * Helpers
 * =======================================================================================
 */
function qs(guildId) {
  return `guild_id=${encodeURIComponent(guildId)}&guild_name=${encodeURIComponent(gname || "")}`;
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

/* =======================================================================================
 * HTTP with inline notifications
 * =======================================================================================
 */
async function http(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    ...opts,
  });

  const raw = await res.text().catch(() => "");
  const type = res.headers.get("content-type") || "";
  const body = type.includes("application/json") ? (()=>{
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  })() : null;

  if (!res.ok) {
    const code = body?.error || null;
    if (code === "too_many_blueprints") {
      __kadieToast(`Create blocked. Maximum blueprints is ${MAX_BLUEPRINTS}.`, "error");
    } else if (code === "too_many_nodes") {
      __kadieToast(`Save blocked. Maximum nodes per blueprint is ${MAX_NODES}.`, "error");
    } else {
      __kadieToast(body?.message || body?.error || `Request failed (${res.status}).`, "error");
    }
    const err = new Error(body?.message || body?.error || `HTTP ${res.status}`);
    err.code = code; err.status = res.status;
    // Keep console logging for dev visibility
    console.error("[providers]", opts.method || "GET", path, res.status, raw);
    throw err;
  }

  if (type.includes("application/json")) return body;
  return raw || null;
}

/* =======================================================================================
 * Public API
 * =======================================================================================
 */
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

  // try direct first
  try {
    const res = await http(`/blueprints?id=${encodeURIComponent(key)}&${qs(guildId)}`);
    const arr = Array.isArray(res) ? res : res ? [res] : [];
    let pick =
      arr.find((x) => String(x?.id || "").toLowerCase() === keyL) ||
      arr.find((x) => String(x?.name || "").toLowerCase() === keyL);
    if (pick) return normalizeItem(pick, key);
  } catch {}

  // fallback: list and match
  const all = await http(`/blueprints?${qs(guildId)}`);
  const items = Array.isArray(all) ? all : Array.isArray(all?.items) ? all.items : [];
  const pick =
    items.find((x) => String(x?.id || "").toLowerCase() === keyL) ||
    items.find((x) => String(x?.name || "").toLowerCase() === keyL) ||
    null;
  return pick ? normalizeItem(pick, key) : null;
}

export async function createBlueprint(guildId, { name }) {
  const display = (name && name.trim()) || `Blueprint ${new Date().toLocaleString()}`;
  const id = slugify(display);
  const payload = {
    id,
    name: display, // keep spaces in display name
    data: { graph: { nodes: [], edges: [] }, script: null },
  };
  try {
    const res = await http(`/blueprints?${qs(guildId)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { id: res?.id || id, name: res?.name || display };
  } catch (e) {
    // toast already shown in http()
    throw e;
  }
}

export async function renameBlueprint(guildId, { id, name }) {
  const body = JSON.stringify({ id, name });
  try {
    await http(`/blueprints?${qs(guildId)}`, { method: "POST", body }); // upsert
    return true;
  } catch {
    try {
      await http(`/blueprints/${encodeURIComponent(id)}?${qs(guildId)}`, { method: "PATCH", body });
      return true;
    } catch {
      return false;
    }
  }
}

export async function deleteBlueprint(guildId, { id }) {
  try {
    await http(`/blueprints/${encodeURIComponent(id)}?${qs(guildId)}`, { method: "DELETE" });
  } catch {
    await http(`/blueprints?id=${encodeURIComponent(id)}&${qs(guildId)}`, { method: "DELETE" });
  }
  return true;
}

export async function saveBlueprint(guildId, bp) {
  const data = bp?.data ?? {};
  const payload = {
    id: bp.id,
    name: bp.name || bp.id,
    data: { graph: data.graph ?? data, script: data.script ?? null },
  };
  try {
    await http(`/blueprints?${qs(guildId)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return true;
  } catch (e) {
    // toast already shown in http()
    throw e;
  }
}
