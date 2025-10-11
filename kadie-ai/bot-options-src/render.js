// ESM. Renders pins and inline editors for unconnected VARIABLE inputs.
import { getGraphState, setNodeInputDefault, isInputConnected } from "./state.js";

function editorForType(t) {
  switch ((t || "string").toLowerCase()) {
    case "number":
    case "float":
    case "int": return "number";
    case "boolean": return "checkbox";
    default: return "text";
  }
}

export function renderNode(node, catalog) {
  const meta = catalog[node.type];
  const el = document.createElement("div");
  el.className = "node";

  const title = document.createElement("div");
  title.className = "node-title";
  title.textContent = meta.label || node.type;
  el.appendChild(title);

  // Exec pins
  const execIn = document.createElement("div");
  execIn.className = "pin pin-exec in";
  execIn.textContent = "in";
  el.appendChild(execIn);

  const execOut = document.createElement("div");
  execOut.className = "pin pin-exec out";
  execOut.textContent = "out";
  el.appendChild(execOut);

  // Inputs with inline editors when not connected
  const inputsWrap = document.createElement("div");
  inputsWrap.className = "pins inputs";
  for (const [key, spec] of Object.entries(meta.inputs || {})) {
    const row = document.createElement("div");
    row.className = "pin-row";

    const sock = document.createElement("div");
    sock.className = "pin var in";
    row.appendChild(sock);

    const label = document.createElement("label");
    label.textContent = spec.label || key;
    row.appendChild(label);

    const showEditor = !isInputConnected(node.id, key);
    if (showEditor) {
      const typeAttr = editorForType(spec.type);
      let input;
      if (typeAttr === "checkbox") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!(node.defaults?.[key]);
      } else {
        input = document.createElement("input");
        input.type = typeAttr;
        input.value = (node.defaults?.[key] ?? "");
      }
      input.className = "pin-editor";
      input.addEventListener("input", () => {
        const val = typeAttr === "checkbox" ? input.checked : input.value;
        setNodeInputDefault(node.id, key, val);
      });
      row.appendChild(input);
    } else {
      const hint = document.createElement("span");
      hint.className = "pin-hint";
      hint.textContent = "connected";
      row.appendChild(hint);
    }

    inputsWrap.appendChild(row);
  }
  el.appendChild(inputsWrap);

  // Outputs
  const outputsWrap = document.createElement("div");
  outputsWrap.className = "pins outputs";
  for (const [key, spec] of Object.entries(meta.outputs || {})) {
    const row = document.createElement("div");
    row.className = "pin-row";

    const sock = document.createElement("div");
    sock.className = "pin var out";
    row.appendChild(sock);

    const label = document.createElement("label");
    label.textContent = spec.label || key;
    row.appendChild(label);

    outputsWrap.appendChild(row);
  }
  el.appendChild(outputsWrap);

  return el;
}
