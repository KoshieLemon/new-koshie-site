// sse.js — GPU/CPU progress live updates via server-sent events
import { store } from "./state.js";
import { API_BASE } from "./utils.js";
import { setCpuBar } from "./progressbar.js";

export function stopGpuStream() {
  try { store.gpuStream?.close(); } catch {}
  store.gpuStream = null;
}

function openSse(url) {
  // eslint-disable-next-line no-console
  console.log("[SSE] connecting ->", url);

  // withCredentials lets cookies flow if your API uses session cookies
  const es = new EventSource(url, { withCredentials: true });

  es.onopen = () => {
    // eslint-disable-next-line no-console
    console.log("[SSE] OPEN ok");
  };

  es.onmessage = (ev) => {
    // eslint-disable-next-line no-console
    console.log("[SSE] msg =", ev.data);
    try {
      const d = JSON.parse(ev.data);
      if (d?.type === "kadie:cpu") setCpuBar(d.current, d.max);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log("[SSE] bad json lol ->", e?.message || e);
    }
  };

  es.onerror = (e) => {
    // eslint-disable-next-line no-console
    console.log("[SSE] ERR eventSource =", e);
    // one fallback: try page origin unprefixed once, in case your proxy is wired there
    if (!store.triedAltSse && store.selectedGuild?.id) {
      store.triedAltSse = true;
      try { es.close(); } catch {}
      const alt = new URL("/runtime/config/stream", window.location.origin);
      alt.searchParams.set("guild_id", store.selectedGuild.id);
      alt.searchParams.set("guild_name", store.selectedGuild.name || "");
      // eslint-disable-next-line no-console
      console.log("[SSE] fallback ->", alt.toString());
      store.gpuStream = openSse(alt.toString());
    }
  };

  return es;
}

export function startGpuStream() {
  if (!store.selectedGuild?.id) {
    // eslint-disable-next-line no-console
    console.log("[SSE] skip start, no guild selected");
    return;
  }
  stopGpuStream();
  store.triedAltSse = false;

  // ALWAYS hit the bot/API host that talks to Firebase Admin.
  // DO NOT prefix with /kadie-ai.
  const u = new URL("/runtime/config/stream", API_BASE);
  u.searchParams.set("guild_id", store.selectedGuild.id);
  u.searchParams.set("guild_name", store.selectedGuild.name || "");
  // eslint-disable-next-line no-console
  console.log("[SSE] guild =", store.selectedGuild, "| url =", u.toString());

  store.gpuStream = openSse(u.toString());
}
