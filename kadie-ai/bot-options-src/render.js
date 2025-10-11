// Renders nodes with exec pins plus typed variable inputs.
// Shows inline input for primitive pins when not connected.
import { getNodeDef } from "./nodes-index.js";
import { state, setNodeParam, isPinConnected } from "./state.js";

const PRIMITIVES = new Set(["string", "number", "boolean"]);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function createPin(label, colorClass) {
  const pin = el("div", `pin ${colorClass}`);
  pin.dataset.label = label;
  pin.title = label;
  const name = el("span", "pin-label", label);
  const wrap = el("div", "pin-wrap");
  wrap.append(pin, name);
  return { wrap, pin, name };
}

function createInlineInput(nodeId, pinName, type, value) {
  const wrap = el("div", "inline-input");
  let input;
  if (type === "boolean") {
    input = el("input"); input.type = "checkbox"; input.checked = !!value;
    input.addEventListener("change", () => setNodeParam(nodeId, pinName, input.checked));
  } else if (type === "number") {
    input = el("input"); input.type = "number"; input.value = value ?? 0;
    input.addEventListener("input", () => setNodeParam(nodeId, pinName, Number(input.value)));
  } else {
    input = el("input"); input.type = "text"; input.value = value ?? "";
    input.addEventListener("input", () => setNodeParam(nodeId, pinName, input.value));
  }
  wrap.appendChild(input);
  return wrap;
}

export function renderNode(node) {
  // node = { id, typeId, params, ... }
  const def = getNodeDef(node.typeId);
  const box = el("div", "node");
  const header = el("div", "node-header", def?.name || node.typeId);
  const body = el("div", "node-body");

  // Exec pins
  const left = el("div", "pins-left");
  const right = el("div", "pins-right");
  (def?.exec?.inputs || ["in"]).forEach(n => {
    const { wrap } = createPin(n, "exec-in");
    left.appendChild(wrap);
  });
  (def?.exec?.outputs || ["out"]).forEach(n => {
    const { wrap } = createPin(n, "exec-out");
    right.appendChild(wrap);
  });

  // Data pins
  const inputsDef = def?.pins?.inputs || def?.inputs || {};
  const outputsDef = def?.pins?.outputs || def?.outputs || {};

  const inputsWrap = el("div", "pins-inputs");
  for (const [name, meta] of Object.entries(inputsDef)) {
    const { wrap } = createPin(name, "data-in");
    // Inline field for primitives only when not connected
    const t = (meta && meta.type) || "string";
    const connected = isPinConnected(node.id, name, "in");
    if (PRIMITIVES.has(t) && !connected) {
      const current = (node.params && node.params[name]) ?? meta.default ?? (t === "number" ? 0 : (t === "boolean" ? false : ""));
      wrap.appendChild(createInlineInput(node.id, name, t, current));
    }
    inputsWrap.appendChild(wrap);
  }

  const outputsWrap = el("div", "pins-outputs");
  for (const [name] of Object.entries(outputsDef)) {
    const { wrap } = createPin(name, "data-out");
    outputsWrap.appendChild(wrap);
  }

  body.append(left, inputsWrap, outputsWrap, right);
  box.append(header, body);
  return box;
}
