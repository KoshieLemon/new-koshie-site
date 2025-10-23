// utils.js — tiny DOM helpers + canonical API origin resolver
export const byId = (id) => document.getElementById(id);
export const setCSSVar = (name, val) => document.documentElement.style.setProperty(name, val);

// Resolve API origin. Order:
// 1) <meta name="api-origin" content="https://api.koshiestudios.com">
// 2) window.__KADIE_API_ORIGIN = "https://api.koshiestudios.com"
// 3) Absolute ME URL via <meta name="me-url" content="https://api.koshiestudios.com/me">
// 4) Hard default: https://api.koshiestudios.com
function pickApiOrigin() {
  let src = "default";
  let apiOrigin =
    document.querySelector('meta[name="api-origin"]')?.content?.trim() || "";

  if (apiOrigin) src = "meta:api-origin";
  if (!apiOrigin && typeof window !== "undefined" && window.__KADIE_API_ORIGIN) {
    apiOrigin = String(window.__KADIE_API_ORIGIN).trim();
    src = "window.__KADIE_API_ORIGIN";
  }
  if (!apiOrigin) {
    const me = document.querySelector('meta[name="me-url"]')?.content?.trim() || "";
    if (/^https?:/i.test(me)) {
      try { apiOrigin = new URL(me).origin; src = "meta:me-url"; } catch {}
    }
  }
  if (!apiOrigin) {
    apiOrigin = "https://api.koshiestudios.com"; // your bot/API host
    src = "fallback:hardcoded";
  }

  // loud, informal debug
  // eslint-disable-next-line no-console
  console.log("[SSE][cfg] apiOrigin =", apiOrigin, "| src =", src, "| pageOrigin =", location.origin);
  return apiOrigin;
}

export const API_BASE = pickApiOrigin(); // canonical API origin (no path)

// Keep for other code that needs to know if the page is served under /kadie-ai
export function runtimePath(p) {
  const base = location.pathname.startsWith("/kadie-ai/") ? "/kadie-ai" : "";
  return base + p;
}
