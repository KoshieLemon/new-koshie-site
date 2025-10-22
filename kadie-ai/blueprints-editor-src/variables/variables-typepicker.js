// variables-typepicker.js
// Type menu with Single / Array / Map. Arrays commit as "array<any>",
// Maps commit as "map<any, any>". Single commits the chosen base type.

export function createTypePicker(allTypes) {
  let ui = null;

  function trim(s) { return String(s || "").trim(); }

  function parseType(t) {
    const s = trim(t);
    if (/\[\]$/.test(s)) return { mode: "array", key: null, val: "any" };
    let m = /^array<\s*([^>]+)\s*>$/i.exec(s);
    if (m) return { mode: "array", key: null, val: "any" };
    m = /^map<\s*([^,>]+)\s*,\s*([^>]+)\s*>$/i.exec(s);
    if (m) return { mode: "map", key: "any", val: "any" };
    if (/^map$/i.test(s)) return { mode: "map", key: "any", val: "any" };
    if (/^array$/i.test(s)) return { mode: "array", key: null, val: "any" };
    return { mode: "single", key: null, val: s || "string" };
  }

  function toCanonical(p) {
    if (p.mode === "array") return "array<any>";
    if (p.mode === "map") return "map<any, any>";
    return trim(p.val) || "string";
  }

  function ensure() {
    if (ui) return ui;

    const root = document.createElement("div");
    root.id = "var-type-picker";
    Object.assign(root.style, {
      position: "fixed",
      zIndex: 2147483647,
      display: "none",
      minWidth: "280px",
      maxWidth: "420px",
      maxHeight: "60vh",
      overflow: "auto",
      background: "#0a0f19",
      color: "#e5e7eb",
      border: "1px solid #1f2937",
      borderRadius: "10px",
      boxShadow: "0 14px 36px rgba(0,0,0,.6)",
      padding: "8px"
    });

    const search = document.createElement("input");
    Object.assign(search.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "6px 8px",
      border: "1px solid #2b2f3a",
      borderRadius: "8px",
      background: "#0f1117",
      color: "#e5e7eb",
      marginBottom: "8px"
    });
    search.placeholder = "Search types…";

    const seg = document.createElement("div");
    Object.assign(seg.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "6px",
      marginBottom: "8px"
    });
    function mkSeg(text) {
      const b = document.createElement("button");
      b.textContent = text;
      Object.assign(b.style, {
        border: "1px solid #2b2f3a",
        background: "#11131a",
        color: "#e5e7eb",
        padding: "6px 8px",
        borderRadius: "8px",
        cursor: "pointer"
      });
      return b;
    }
    const segSingle = mkSeg("Single"),
      segArray = mkSeg("Array"),
      segMap = mkSeg("Map");
    seg.append(segSingle, segArray, segMap);
    function setSeg(which) {
      [segSingle, segArray, segMap].forEach((b) => {
        b.style.background = b === which ? "#1d4ed8" : "#11131a";
        b.style.borderColor = b === which ? "#1e40af" : "#2b2f3a";
      });
    }

    const list = document.createElement("div");
    Object.assign(list.style, {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "4px"
    });

    let onCommit = null;
    let parsed = { mode: "single", key: null, val: "string" };

    function paintList() {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      const items = allTypes.filter((t) => !q || t.toLowerCase().includes(q));
      for (const t of items) {
        const btn = document.createElement("button");
        btn.textContent = t;
        Object.assign(btn.style, {
          textAlign: "left",
          border: "1px solid #2b2f3a",
          background: "#0f1117",
          color: "#e5e7eb",
          padding: "6px 8px",
          borderRadius: "8px",
          cursor: "pointer"
        });
        btn.onmouseenter = () => (btn.style.background = "#0c1730");
        btn.onmouseleave = () => (btn.style.background = "#0f1117");
        btn.onclick = () => {
          if (!onCommit) return;
          // Only Single uses the selected base type.
          // Array/Map always commit structure-only any/any.
          const next =
            parsed.mode === "single"
              ? { mode: "single", key: null, val: t }
              : parsed.mode === "array"
              ? { mode: "array", key: null, val: "any" }
              : { mode: "map", key: "any", val: "any" };
          const out = toCanonical(next);
          onCommit(out);
          close();
        };
        list.appendChild(btn);
      }
    }

    function openAt(clientX, clientY, currentType, commit) {
      onCommit = commit;
      parsed = parseType(currentType);

      setSeg(parsed.mode === "single" ? segSingle : parsed.mode === "array" ? segArray : segMap);
      search.value = "";
      paintList();

      root.style.left = "-9999px";
      root.style.top = "-9999px";
      root.style.display = "block";
      const mw = root.offsetWidth,
        mh = root.offsetHeight;
      const vw = innerWidth,
        vh = innerHeight,
        pad = 8;
      let left = clientX + 12,
        top = clientY + 12;
      if (left + mw > vw - pad) left = clientX - mw - 12;
      if (top + mh > vh - pad) top = clientY - mh - 12;
      left = Math.min(vw - pad - mw, Math.max(pad, left));
      top = Math.min(vh - pad - mh, Math.max(pad, top));
      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      setTimeout(() => search.focus(), 0);

      const outside = (ev) => {
        if (!root.contains(ev.target)) {
          close();
          cleanup();
        }
      };
      const onKey = (ev) => {
        if (ev.key === "Escape") {
          close();
          cleanup();
        }
        if (ev.key === "Enter") {
          const first = list.querySelector("button");
          if (first) {
            first.click();
            cleanup();
          }
        }
      };
      function cleanup() {
        window.removeEventListener("pointerdown", outside, true);
        window.removeEventListener("keydown", onKey, true);
      }
      window.addEventListener("pointerdown", outside, true);
      window.addEventListener("keydown", onKey, true);
    }

    function close() {
      root.style.display = "none";
    }

    function applyMode(mode, segBtn) {
      parsed = { mode, key: mode === "map" ? "any" : null, val: mode === "single" ? "string" : "any" };
      setSeg(segBtn);
      // Commit immediately on structure change
      if (onCommit) onCommit(toCanonical(parsed));
      close();
    }

    search.addEventListener("input", paintList);
    segSingle.onclick = () => applyMode("single", segSingle);
    segArray.onclick = () => applyMode("array", segArray);
    segMap.onclick = () => applyMode("map", segMap);

    root.append(search, seg, list);
    document.body.appendChild(root);
    ui = { root, openAt, close };
    return ui;
  }

  return {
    open(clientX, clientY, currentType, commit) {
      const p = parseType(currentType);
      ensure().openAt(clientX, clientY, toCanonical(p), commit);
    }
  };
}
