// ESM. Builds a client-side catalog with friendly pin labels/types.
import { getNodesIndex } from "../../assets/api.js";

// Pin aliases for known nodes (keys stay 'a','b' for runtime).
const PIN_ALIASES = {
  "events.messageCreate": {
    outputs: {
      a: { type: "string", label: "content" },
      b: { type: "string", label: "channelId" }
    }
  },
  "actions.messages.sendMessage": {
    inputs: {
      a: { type: "string", label: "content", required: true },
      b: { type: "string", label: "channelId", required: false }
    }
  }
};

export async function loadNodeCatalog() {
  const raw = await getNodesIndex(); // expects server to serve nodes-index.json
  const catalog = {};
  for (const [id, node] of Object.entries(raw)) {
    const alias = PIN_ALIASES[id] || {};
    const inputs = { ...(node.inputs || {}) };
    const outputs = { ...(node.outputs || {}) };

    // Apply aliases without changing keys used by runtime
    if (alias.inputs) {
      for (const [k, v] of Object.entries(alias.inputs)) inputs[k] = { ...(inputs[k] || {}), ...v };
    }
    if (alias.outputs) {
      for (const [k, v] of Object.entries(alias.outputs)) outputs[k] = { ...(outputs[k] || {}), ...v };
    }

    catalog[id] = {
      ...node,
      inputs,
      outputs
    };
  }
  return catalog;
}
